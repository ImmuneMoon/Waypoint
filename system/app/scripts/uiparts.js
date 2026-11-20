// The app's own controls (1.6.2; the owner, 2026-11-13: "lets make good styling a part of the design so we dont have to keep going back and
// correcting things please", and "any slider, or increment control should allow the typing of values"). The look is style.css's .ui-step,
// .ui-seg, .ui-slide, .ui-val and .ui-unit; this module builds them, so a counter and a slider take a typed value the same way everywhere.
//   step(o)          a counter: − and + and a value you type in, in one frame. o: value, min, max, step (1), dec (0), unit, label,
//                    lessTip, moreTip, lessCls, moreCls, valCls, cls, off (no − or +, the value read only), set(v) called with a value
//                    held to min and max and rounded to dec places, never with the value it already has. The counter answered has
//                    setValue(v) for a figure that changed without it being made again
//   typed(range, o)  a slider's figure as a box you type in, right after the slider: kept in step with the slider both ways, a value set
//                    by code included; a typed value is held to the slider's bounds and handed on as the slider's own input and change
//                    events, so the slider's handlers do the rest. A slider standing in no .ui-slide is put in one, as wide as it was.
//                    o: unit, label, dec, hide (the element that showed its figure before, put away), fmt and parse (a figure written
//                    another way, such as a time as m:ss, typed as text)
//   typedAll(root)   typed() for every slider marked data-typed (its unit in data-unit, the old figure's id in data-hide) with no box
//   fmtTime, readTime  a time in seconds as m:ss, and back
//   card(o)          one item shown on its own, as the containers window shows a picked item (the owner, 2026-11-13: "Library picker and
//                    form, Buy and Sell, Tile, map object, deck, the maybes too"): its picture large, its name and a gray line under it,
//                    a place at the right of its head for a counter, then whatever the caller puts in its body, and its actions in a row
//                    at its foot. o: name, sub, pic (an element the caller made: an img, an svg), glyph (a bundled icon's file as
//                    systemcore glyphPath answers it, such as solid/star), ch (a character), cls. Every word is set as text. Answers { el, top, pic, who, name, sub, side, body,
//                    acts }; an empty body or foot takes no room
//   pick(o)          a choice of a few, one picked (the review of a new room's map, 2026-11-14): a caption over a .ui-seg.ui-seg-wide of
//                    buttons, the picked one pressed (aria-pressed, .on, gold by the seg's own rules), and one gray line under it saying
//                    what the picked one does. The caption names the group (aria-labelledby). o: label, choices [{ value, name, says }],
//                    value, cls, set(v) called when a press or a key picks another. The arrows, Home and End move the pick and the focus
//                    along it and go no further; Enter and the space bar are a button's own press. Every word is set as text. Answers the
//                    .ui-pick element with picked() (the value picked), setValue(v) (shown, set not called), focusPick(), touched (true
//                    once a press or a key picked) and buttons
//   find(o)          a choice of many, one picked, with a search over them (1.6.3; the owner, 2026-11-19, of an entry picked by name
//                    among a list's 120: "im usually partial to lists having searches too"): a search box and a list, joined in one
//                    .ui-find frame. o: choices [{ value, name, sub }] (sub, a few gray words a search reads too, such as GM only),
//                    value, blank (the words of a first row that picks nothing; none: no such row), gone (the words for a value no
//                    choice has any more, kept and shown so that nothing stored is lost), label, placeholder, cls, max (rows shown at
//                    most, 200), set(v) called when a pick changes. Answers the .ui-find element with picked(), setValue(v) (shown, set
//                    not called), input and select
//   findMatch        whether a choice holds every word typed anywhere, case and accents aside (pure, for the suites)
//   clampTo, roundTo the pure rules, for the suites
function fin(n) { return typeof n === 'number' && isFinite(n); }
function roundTo(v, dec) { var k = Math.pow(10, Math.max(0, Math.min(6, dec | 0))); return Math.round(v * k) / k; }
function clampTo(v, lo, hi) { if (!fin(v)) return null; if (fin(lo)) v = Math.max(lo, v); if (fin(hi)) v = Math.min(hi, v); return v; }
function num(v) { var n = typeof v === 'number' ? v : parseFloat(v); return fin(n) ? n : null; }
var _down = false, _queue = [];
if (typeof document !== 'undefined' && document.addEventListener) {
    var lift = function() { _down = false; var q = _queue.splice(0); if (q.length) setTimeout(function() { q.forEach(function(f) { f(); }); }, 0); };
    document.addEventListener('pointerdown', function() { _down = true; }, true); document.addEventListener('pointerup', lift, true); document.addEventListener('pointercancel', lift, true);
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('blur', lift);
}
// A typed figure handed on now, or, where a press took the focus from it, once that press has landed (its click first)
function later(fn) { if (_down) _queue.push(fn); else fn(); }
function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function valBox(doc, label, unit, valCls, text) {
    var box = el(doc, 'span', 'ui-val'), inp = el(doc, 'input', valCls || '');
    inp.type = 'text'; inp.setAttribute('inputmode', text === 'neg' ? 'text' : text ? 'numeric' : 'decimal'); inp.setAttribute('spellcheck', 'false'); inp.setAttribute('aria-label', label || 'Value'); inp.setAttribute('autocomplete', 'off');
    box.appendChild(inp); if (unit) box.appendChild(el(doc, 'span', 'ui-unit', unit));
    box.addEventListener('mousedown', function(ev) { if (ev.target !== inp) { ev.preventDefault(); inp.focus(); inp.select(); } });   // a press on the frame or the unit types in the box
    box.addEventListener('click', function(ev) { if (ev.target !== inp) ev.preventDefault(); });   // and never hands the press on to a label's own control (a slider in the label)
    return { box: box, inp: inp };
}
function fmtTime(s) { s = Math.max(0, Math.floor(num(s) || 0)); var m = Math.floor(s / 60), r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }
function readTime(t) { if (typeof t !== 'string') return num(t); var m = /^\s*(?:(\d{1,4}):)?(\d{1,4}(?:\.\d+)?)\s*$/.exec(t); return m ? (m[1] ? parseInt(m[1], 10) * 60 : 0) + parseFloat(m[2]) : null; }
var GLYPH_BASE = '/assets/icons/fa/', GLYPH_FILE = /^(solid|regular|brands)\/[a-z0-9-]{1,40}$/;
function card(o, doc) {
    doc = doc || document; o = o || {};
    var w = el(doc, 'div', 'ui-card' + (o.cls ? ' ' + o.cls : '')), top = el(doc, 'div', 'ui-card-top'), pic = el(doc, 'span', 'ui-card-pic'), who = el(doc, 'div', 'ui-card-who');
    var nm = el(doc, 'b', 'ui-card-name', o.name === undefined || o.name === null ? '' : String(o.name)), sub = el(doc, 'small', 'ui-card-sub', o.sub === undefined || o.sub === null ? '' : String(o.sub));
    if (o.pic && typeof o.pic === 'object' && o.pic.nodeType === 1) pic.appendChild(o.pic);
    else if (typeof o.glyph === 'string' && GLYPH_FILE.test(o.glyph)) { var g = el(doc, 'span', 'wp-glyph ui-card-glyph'), u = 'url("' + GLYPH_BASE + o.glyph + '.svg")'; g.setAttribute('aria-hidden', 'true'); g.style.webkitMaskImage = u; g.style.maskImage = u; pic.appendChild(g); }   // a bundled icon, drawn as the sheet draws one (its address built from the fixed table's answer alone)
    else { var c0 = typeof o.name === 'string' ? Array.from(o.name.trim())[0] : ''; pic.appendChild(el(doc, 'span', 'ui-card-ch', String(o.ch || (c0 ? c0.toUpperCase() : '?')))); }   // the name's first whole character, never half of one
    who.appendChild(nm); if (sub.textContent) who.appendChild(sub);
    var side = el(doc, 'span', 'ui-card-side'), body = el(doc, 'div', 'ui-card-body'), acts = el(doc, 'div', 'ui-card-acts');
    top.appendChild(pic); top.appendChild(who); top.appendChild(side); w.appendChild(top); w.appendChild(body); w.appendChild(acts);
    return { el: w, top: top, pic: pic, who: who, name: nm, sub: sub, side: side, body: body, acts: acts };
}
function step(o, doc) {
    doc = doc || document; o = o || {};
    var lo = num(o.min), hi = num(o.max), st = num(o.step) || 1, dec = fin(o.dec) ? o.dec : 0, cur = num(o.value);
    var w = el(doc, 'span', 'ui-step' + (o.cls ? ' ' + o.cls : '')); w.setAttribute('role', 'group'); if (o.label) w.setAttribute('aria-label', o.label);
    var mi = el(doc, 'button', o.lessCls || '', '−'), pl = el(doc, 'button', o.moreCls || '', '+'), v = valBox(doc, o.label, o.unit, o.valCls, lo !== null && lo < 0 ? 'neg' : false);
    if (o.data) Object.keys(o.data).forEach(function(k) { v.inp.dataset[k] = o.data[k]; });   // what a view that draws itself again finds the box by, to put the focus back
    mi.type = 'button'; pl.type = 'button'; mi.title = o.lessTip || 'One less'; pl.title = o.moreTip || 'One more'; mi.setAttribute('aria-label', mi.title); pl.setAttribute('aria-label', pl.title);
    if (lo !== null) v.inp.min = String(lo); if (hi !== null) v.inp.max = String(hi); v.inp.step = String(Math.pow(10, -dec));
    var fit = function() { var t = String(v.inp.value || ''); v.inp.style.width = Math.max(2, t.length) + 1 + 'ch'; };   // as wide as its figure, a long count never cut
    v.inp.value = cur === null ? '' : String(roundTo(cur, dec)); fit();
    mi.disabled = !!o.off || (cur !== null && lo !== null && cur <= lo); pl.disabled = !!o.off || (cur !== null && hi !== null && cur >= hi); v.inp.readOnly = !!o.off;
    var ends = function() { mi.disabled = !!o.off || (cur !== null && lo !== null && cur <= lo); pl.disabled = !!o.off || (cur !== null && hi !== null && cur >= hi); };
    // 1.6.3 (the review of input): a counter hands its figure on here (Enter, the arrow keys, − and +, flush), never by a change event, so the mark a
    // view of the sheet keeps on a box being typed in (_wpTyped, sheets.js typedMark) is taken off here too: the figure is with the caller now, and a
    // redraw must show what is stored (a refusal, a correction), never the figure typed again
    var go = function(n) { pend = null; v.inp._wpTyped = false; var c = clampTo(n, lo, hi); if (c === null) { v.inp.value = cur === null ? '' : String(roundTo(cur, dec)); fit(); return; } c = roundTo(c, dec); v.inp.value = String(c); fit(); if (c === cur) return; cur = c; ends(); if (typeof o.set === 'function') o.set(c);
        if (typeof o.truth === 'function') setTimeout(function() { if (!w.isConnected) return; var t = num(o.truth()); if (t !== null && t !== cur) w.setValue(t); }, 450);   // a change the caller did not make (a price window cancelled, a refusal) puts the true figure back
    };
    var pend = null;
    var base = function() { var t = num(v.inp.value); return doc.activeElement !== v.inp && t !== null ? t : cur === null ? 0 : cur; };   // a figure the caller wrote into the box since counts
    mi.addEventListener('click', function() { if (pend) pend(); go(base() - st); });
    pl.addEventListener('click', function() { if (pend) pend(); go(base() + st); });
    v.inp.addEventListener('change', function() { var n = num(v.inp.value); pend = function() { go(n); }; later(function() { if (pend) pend(); }); });
    v.inp.addEventListener('input', fit);
    v.inp.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') { ev.preventDefault(); go(num(v.inp.value)); } else if ((ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && !ev.altKey && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); ev.stopPropagation(); go((num(v.inp.value) === null ? (cur || 0) : num(v.inp.value)) + (ev.key === 'ArrowUp' ? st : -st)); } else if (ev.key === 'Escape' && v.inp.value !== String(roundTo(cur, dec))) { ev.preventDefault(); ev.stopPropagation(); v.inp.value = cur === null ? '' : String(roundTo(cur, dec)); } });
    w.appendChild(mi); w.appendChild(v.box); w.appendChild(pl);
    w.less = mi; w.more = pl; w.input = v.inp;
    w.setValue = function(n) { var c = num(n); cur = c === null ? null : roundTo(c, dec); if (doc.activeElement !== v.inp) { v.inp.value = cur === null ? '' : String(cur); fit(); } ends(); };   // a figure that changed without the counter being made again
    // 1.6.3 (the improvement week's review of sheets and rolls, finding 4): a figure typed and then a press of another button (the ± window's Roll, Take in a
    // container) lost the figure: the box's change waits for that press to land (later), and the button's own click came first and read the old figure.
    // flush() hands on what the box holds now, at once, so a caller that acts on the counter asks it first. A figure that is no number is left as it is
    w.flush = function() { if (pend) { pend(); return; } var n = num(v.inp.value); if (n !== null && n !== cur) go(n); };
    return w;
}
var _pickN = 0, PICK_KEYS = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
function pick(o, doc) {
    doc = doc || document; o = o || {};
    var ch = (Array.isArray(o.choices) ? o.choices : []).filter(function(c) { return c && typeof c.value === 'string'; });
    var w = el(doc, 'div', 'ui-pick' + (o.cls ? ' ' + o.cls : '')), cap = el(doc, 'div', 'ui-pick-cap', o.label === undefined || o.label === null ? '' : String(o.label));
    var seg = el(doc, 'div', 'ui-seg ui-seg-wide'), say = el(doc, 'small', 'ui-pick-say'), at = -1;
    cap.id = 'uiPick' + (++_pickN); seg.setAttribute('role', 'group'); seg.setAttribute('aria-labelledby', cap.id);
    var btns = ch.map(function(c) { var b = el(doc, 'button', 'tool', c.name === undefined || c.name === null ? c.value : String(c.name)); b.type = 'button'; b.dataset.v = c.value; return b; });
    var show = function(v) {
        at = 0; for (var i = 0; i < ch.length; i++) if (ch[i].value === v) { at = i; break; }   // a value that is none of the choices shows the first
        btns.forEach(function(b, i) { var on = i === at; b.className = on ? 'tool on' : 'tool'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });   // the focus goes to the picked one, the arrows to the rest
        say.textContent = ch[at] && ch[at].says !== undefined && ch[at].says !== null ? String(ch[at].says) : '';
    };
    var go = function(i, focus) { if (i < 0 || i >= ch.length) return; w.touched = true; var was = at; show(ch[i].value); if (focus) btns[i].focus(); if (i !== was && typeof o.set === 'function') o.set(ch[i].value); };
    btns.forEach(function(b, i) {
        b.addEventListener('click', function() { go(i, false); });
        b.addEventListener('keydown', function(ev) {
            if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
            var n = PICK_KEYS[ev.key] !== undefined ? (i + PICK_KEYS[ev.key] + ch.length) % ch.length : ev.key === 'Home' ? 0 : ev.key === 'End' ? ch.length - 1 : -1;
            if (n < 0) return;
            ev.preventDefault(); ev.stopPropagation(); go(n, true);   // the page reads the arrows as moving what is selected: they stop here
        });
        seg.appendChild(b);
    });
    w.appendChild(cap); w.appendChild(seg); w.appendChild(say);
    w.touched = false; w.buttons = btns;
    w.picked = function() { return ch[at] ? ch[at].value : null; };
    w.setValue = function(v) { show(v); };
    w.focusPick = function() { if (btns[at]) btns[at].focus(); };
    show(o.value);
    return w;
}
// A search's words: lower case, accents taken off (NFD, then the marks dropped), split on anything that is no letter or digit. Pure
function findWords(t) { return String(t === undefined || t === null ? '' : t).normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean); }
// Whether a choice matches what was typed: every word typed stands somewhere in its name or its gray words, as the library's picker
// searches (librarycore entryHay), so "sword" finds Broadsword and "off ha" finds Off Hand. Nothing typed matches every choice
function findMatch(c, q) {
    var want = findWords(q); if (!want.length) return true;
    var have = findWords((c && c.name !== undefined && c.name !== null ? c.name : '') + ' ' + (c && c.sub ? c.sub : '')).join(' ');
    return want.every(function(w) { return have.indexOf(w) >= 0; });
}
// The choice of many with a search (see the head of the file). The list is drawn again at each word typed: the picked one stays first, so it is
// always in sight and never changed by a search, then what matches, at most o.max, and a last row that says how many more a search would show.
// A choice is picked from the list itself (its change event, which the arrow keys and a press give alike), and that pick leaves the list's order as it stands; Enter in the search box picks the
// first that matches and ArrowDown goes on to the list. Escape in a search that holds words empties it and goes no further (esckey.js escKeep
// leaves such a press to it). Every word is set as text: a choice's name can come from a file
function find(o, doc) {
    doc = doc || document; o = o || {};
    var ch = (Array.isArray(o.choices) ? o.choices : []).filter(function(c) { return c && typeof c.value === 'string' && c.value !== ''; });
    var max = fin(o.max) && o.max > 0 ? Math.floor(o.max) : 200, cur = typeof o.value === 'string' ? o.value : '', MORE = '\u0000more';
    var w = el(doc, 'span', 'ui-find' + (o.cls ? ' ' + o.cls : '')), q = el(doc, 'input', 'field ui-find-q'), sel = el(doc, 'select', 'field ui-find-sel');
    q.type = 'text'; q.placeholder = typeof o.placeholder === 'string' ? o.placeholder : 'Search'; q.setAttribute('aria-label', 'Search ' + (o.label ? String(o.label).toLowerCase() : 'the list')); q.setAttribute('autocomplete', 'off'); q.setAttribute('spellcheck', 'false'); q.title = 'Type a few letters to narrow the list beside it';
    if (o.label) { sel.setAttribute('aria-label', String(o.label)); sel.title = String(o.label); }
    var nameOf = function(c) { return (c.name === undefined || c.name === null || c.name === '' ? c.value : String(c.name)) + (c.sub ? ' (' + c.sub + ')' : ''); };
    var add = function(v, t, off) { var op = el(doc, 'option', '', t); op.value = v; if (off) op.disabled = true; sel.appendChild(op); };
    var show = function() {
        while (sel.firstChild) sel.removeChild(sel.firstChild);
        var mine = null; for (var i = 0; i < ch.length; i++) if (ch[i].value === cur) { mine = ch[i]; break; }
        if (typeof o.blank === 'string') add('', o.blank);
        if (cur && mine) add(cur, nameOf(mine)); else if (cur) add(cur, typeof o.gone === 'string' ? o.gone : cur);   // the pick first, in sight whatever is typed
        var hits = ch.filter(function(c) { return c !== mine && findMatch(c, q.value); });
        hits.slice(0, max).forEach(function(c) { add(c.value, nameOf(c)); });
        if (hits.length > max) add(MORE, (hits.length - max) + ' more. Search to narrow them', true);
        sel.value = cur;
    };
    // A pick. From the search (Enter) the list is drawn again with the pick first. From the list itself (still) it is NOT drawn again: a
    // closed list changes its pick at every arrow key (Chromium on Windows, what Electron runs), and a list that moved its pick to the top at
    // each one sent the next ArrowDown back to the row just left, so the arrows went back and forth between two entries (the review of
    // 2026-11-19). The order stays as it is until the next word is typed, which puts the pick first again
    var go = function(v, still) {
        if (typeof v !== 'string' || v === MORE || v === cur) { if (still) sel.value = cur; else show(); return; }
        cur = v; if (!still) show(); if (typeof o.set === 'function') o.set(v);
    };
    q.addEventListener('input', show);
    q.addEventListener('keydown', function(ev) {
        if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
        if (ev.key === 'Enter') { var first = ch.filter(function(c) { return findMatch(c, q.value); })[0]; ev.preventDefault(); ev.stopPropagation(); if (first && q.value) go(first.value); }
        else if (ev.key === 'ArrowDown') { ev.preventDefault(); ev.stopPropagation(); sel.focus(); }
        else if (ev.key === 'Escape' && q.value) { ev.preventDefault(); ev.stopPropagation(); q.value = ''; show(); }
    });
    sel.addEventListener('change', function() { go(sel.value, true); });
    w.appendChild(q); w.appendChild(sel);
    w.input = q; w.select = sel;
    w.picked = function() { return cur; };
    w.setValue = function(v) { cur = typeof v === 'string' ? v : ''; show(); };
    show();
    return w;
}
var VALUE = typeof HTMLInputElement !== 'undefined' ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') : null;
function typed(range, o) {
    if (!range || range._uiVal) return range && range._uiVal;
    o = o || {}; var doc = range.ownerDocument || document, dec = fin(o.dec) ? o.dec : 0, fmt = typeof o.fmt === 'function' ? o.fmt : null, parse = typeof o.parse === 'function' ? o.parse : num;
    var v = valBox(doc, o.label || range.getAttribute('aria-label') || range.title || 'Value', o.unit, '', fmt ? true : (num(range.min) !== null && num(range.min) < 0 ? 'neg' : false));
    var lo = num(range.min), hi = num(range.max); if (!fmt) { if (lo !== null) v.inp.min = String(lo); if (hi !== null) v.inp.max = String(hi); v.inp.step = range.step && range.step !== 'any' ? range.step : String(Math.pow(10, -dec)); }
    var say = function(x) { var n = num(x) || 0; return fmt ? fmt(n) : String(roundTo(n, dec)); };
    var show = function() { if (doc.activeElement !== v.inp) v.inp.value = say(VALUE ? VALUE.get.call(range) : range.value); v.inp.disabled = !!range.disabled; };
    if (VALUE) Object.defineProperty(range, 'value', { configurable: true, get: function() { return VALUE.get.call(range); }, set: function(x) { VALUE.set.call(range, x); show(); } });   // a value set by code shows in the box too
    var pendS = null, put = function() { pendS = null; var n = clampTo(parse(v.inp.value), num(range.min), num(range.max)); if (n === null) { v.inp.value = say(VALUE ? VALUE.get.call(range) : range.value); return; } range.value = String(n); range.dispatchEvent(new Event('input', { bubbles: true })); range.dispatchEvent(new Event('change', { bubbles: true })); v.inp.value = say(VALUE ? VALUE.get.call(range) : range.value); };
    range.addEventListener('input', function(ev) { if (ev && ev.isTrusted) pendS = null; show(); }); range.addEventListener('change', show);   // the slider dragged: a figure typed before is let go
    v.inp.addEventListener('change', function() { pendS = put; later(function() { if (pendS) pendS(); }); });
    v.inp.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') { ev.preventDefault(); put(); } else if ((ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && !fmt && !ev.altKey && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); ev.stopPropagation(); var s = num(range.step) || 1; v.inp.value = String((parse(v.inp.value) === null ? num(range.value) || 0 : parse(v.inp.value)) + (ev.key === 'ArrowUp' ? s : -s)); put(); } });
    v.inp.addEventListener('blur', show);
    if (typeof MutationObserver !== 'undefined') new MutationObserver(show).observe(range, { attributes: true, attributeFilter: ['disabled', 'min', 'max'] });   // a slider switched off switches its box off
    if (!(range.closest && range.closest('.ui-slide'))) { var wrap = el(doc, 'span', 'ui-slide ui-slide-wide'); range.parentNode.insertBefore(wrap, range); wrap.appendChild(range); }   // a slider on its own is put in a .ui-slide, as wide as it stood
    range.parentNode.insertBefore(v.box, range.nextSibling);
    if (o.hide && o.hide.style) o.hide.style.display = 'none';   // the figure shown before: the box shows it now
    range._uiVal = v.box; v.box.input = v.inp; show();
    return v.box;
}
function typedAll(root) {
    var r = root || document; if (!r.querySelectorAll) return 0;
    var n = 0; [].forEach.call(r.querySelectorAll('input[type="range"][data-typed]'), function(x) { if (!x._uiVal) { var hid = x.getAttribute('data-hide'), h = hid && x.ownerDocument ? x.ownerDocument.getElementById(hid) : null; typed(x, { unit: x.getAttribute('data-unit') || '', hide: h }); n++; } });
    return n;
}
var API = { card: card, pick: pick, find: find, findMatch: findMatch, step: step, typed: typed, typedAll: typedAll, clampTo: clampTo, roundTo: roundTo, fmtTime: fmtTime, readTime: readTime };
export { card, pick, find, findMatch, step, typed, typedAll, clampTo, roundTo, fmtTime, readTime };
if (typeof window !== 'undefined') {
    window.wpUi = API;
    if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { typedAll(document); }); else typedAll(document); }
}

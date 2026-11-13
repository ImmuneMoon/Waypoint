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
//   clampTo, roundTo the pure rules, for the suites
function fin(n) { return typeof n === 'number' && isFinite(n); }
function roundTo(v, dec) { var k = Math.pow(10, Math.max(0, Math.min(6, dec | 0))); return Math.round(v * k) / k; }
function clampTo(v, lo, hi) { if (!fin(v)) return null; if (fin(lo)) v = Math.max(lo, v); if (fin(hi)) v = Math.min(hi, v); return v; }
function num(v) { var n = typeof v === 'number' ? v : parseFloat(v); return fin(n) ? n : null; }
function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function valBox(doc, label, unit, valCls, text) {
    var box = el(doc, 'span', 'ui-val'), inp = el(doc, 'input', valCls || '');
    inp.type = text ? 'text' : 'number'; if (text) inp.setAttribute('inputmode', 'numeric'); inp.setAttribute('aria-label', label || 'Value'); inp.setAttribute('autocomplete', 'off');
    box.appendChild(inp); if (unit) box.appendChild(el(doc, 'span', 'ui-unit', unit));
    box.addEventListener('mousedown', function(ev) { if (ev.target === box) { ev.preventDefault(); inp.focus(); inp.select(); } });   // a press on the frame types in the box
    return { box: box, inp: inp };
}
function fmtTime(s) { s = Math.max(0, Math.floor(num(s) || 0)); var m = Math.floor(s / 60), r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }
function readTime(t) { if (typeof t !== 'string') return num(t); var m = /^\s*(?:(\d{1,4}):)?(\d{1,4}(?:\.\d+)?)\s*$/.exec(t); return m ? (m[1] ? parseInt(m[1], 10) * 60 : 0) + parseFloat(m[2]) : null; }
function step(o, doc) {
    doc = doc || document; o = o || {};
    var lo = num(o.min), hi = num(o.max), st = num(o.step) || 1, dec = fin(o.dec) ? o.dec : 0, cur = num(o.value);
    var w = el(doc, 'span', 'ui-step' + (o.cls ? ' ' + o.cls : '')); w.setAttribute('role', 'group'); if (o.label) w.setAttribute('aria-label', o.label);
    var mi = el(doc, 'button', o.lessCls || '', '−'), pl = el(doc, 'button', o.moreCls || '', '+'), v = valBox(doc, o.label, o.unit, o.valCls);
    mi.type = 'button'; pl.type = 'button'; mi.title = o.lessTip || 'One less'; pl.title = o.moreTip || 'One more'; mi.setAttribute('aria-label', mi.title); pl.setAttribute('aria-label', pl.title);
    if (lo !== null) v.inp.min = String(lo); if (hi !== null) v.inp.max = String(hi); v.inp.step = String(Math.pow(10, -dec));
    v.inp.value = cur === null ? '' : String(roundTo(cur, dec));
    mi.disabled = !!o.off || (cur !== null && lo !== null && cur <= lo); pl.disabled = !!o.off || (cur !== null && hi !== null && cur >= hi); v.inp.readOnly = !!o.off;
    var ends = function() { mi.disabled = !!o.off || (cur !== null && lo !== null && cur <= lo); pl.disabled = !!o.off || (cur !== null && hi !== null && cur >= hi); };
    var go = function(n) { var c = clampTo(n, lo, hi); if (c === null) { v.inp.value = cur === null ? '' : String(roundTo(cur, dec)); return; } c = roundTo(c, dec); v.inp.value = String(c); if (c === cur) return; cur = c; ends(); if (typeof o.set === 'function') o.set(c); };
    var base = function() { var t = num(v.inp.value); return doc.activeElement !== v.inp && t !== null ? t : cur === null ? 0 : cur; };   // a figure the caller wrote into the box since counts
    mi.addEventListener('click', function() { go(base() - st); });
    pl.addEventListener('click', function() { go(base() + st); });
    v.inp.addEventListener('change', function() { go(num(v.inp.value)); });
    v.inp.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') { ev.preventDefault(); go(num(v.inp.value)); } else if (ev.key === 'Escape' && v.inp.value !== String(roundTo(cur, dec))) { ev.preventDefault(); ev.stopPropagation(); v.inp.value = cur === null ? '' : String(roundTo(cur, dec)); } });
    w.appendChild(mi); w.appendChild(v.box); w.appendChild(pl);
    w.less = mi; w.more = pl; w.input = v.inp;
    w.setValue = function(n) { var c = num(n); cur = c === null ? null : roundTo(c, dec); if (doc.activeElement !== v.inp) v.inp.value = cur === null ? '' : String(cur); ends(); };   // a figure that changed without the counter being made again
    return w;
}
var VALUE = typeof HTMLInputElement !== 'undefined' ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') : null;
function typed(range, o) {
    if (!range || range._uiVal) return range && range._uiVal;
    o = o || {}; var doc = range.ownerDocument || document, dec = fin(o.dec) ? o.dec : 0, fmt = typeof o.fmt === 'function' ? o.fmt : null, parse = typeof o.parse === 'function' ? o.parse : num;
    var v = valBox(doc, o.label || range.getAttribute('aria-label') || range.title || 'Value', o.unit, '', !!fmt);
    var lo = num(range.min), hi = num(range.max); if (!fmt) { if (lo !== null) v.inp.min = String(lo); if (hi !== null) v.inp.max = String(hi); v.inp.step = range.step && range.step !== 'any' ? range.step : String(Math.pow(10, -dec)); }
    var say = function(x) { var n = num(x) || 0; return fmt ? fmt(n) : String(roundTo(n, dec)); };
    var show = function() { if (doc.activeElement !== v.inp) v.inp.value = say(VALUE ? VALUE.get.call(range) : range.value); v.inp.disabled = !!range.disabled; };
    if (VALUE) Object.defineProperty(range, 'value', { configurable: true, get: function() { return VALUE.get.call(range); }, set: function(x) { VALUE.set.call(range, x); show(); } });   // a value set by code shows in the box too
    var put = function() { var n = clampTo(parse(v.inp.value), num(range.min), num(range.max)); if (n === null) { v.inp.value = say(VALUE ? VALUE.get.call(range) : range.value); return; } range.value = String(n); range.dispatchEvent(new Event('input', { bubbles: true })); range.dispatchEvent(new Event('change', { bubbles: true })); v.inp.value = say(VALUE ? VALUE.get.call(range) : range.value); };
    range.addEventListener('input', show); range.addEventListener('change', show);
    v.inp.addEventListener('change', put);
    v.inp.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') { ev.preventDefault(); put(); } });
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
var API = { step: step, typed: typed, typedAll: typedAll, clampTo: clampTo, roundTo: roundTo, fmtTime: fmtTime, readTime: readTime };
export { step, typed, typedAll, clampTo, roundTo, fmtTime, readTime };
if (typeof window !== 'undefined') {
    window.wpUi = API;
    if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { typedAll(document); }); else typedAll(document); }
}

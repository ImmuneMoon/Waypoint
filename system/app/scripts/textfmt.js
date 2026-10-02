/* Text formats (1.5.0) — the styling of ONE plain text field, stored beside the text, never inside it.
   A title, a table cell, a flowchart node's label stay the plain strings they always were; what the Text style bar
   does to them is a small object kept next to the value it belongs to:

     { size?, color?, b?, i?, spans? }      size / color / b / i: the base, for the whole field
     spans: [{ s, e, color?, b?, i? }]      parts with a look of their own; s and e are JavaScript string offsets

   A pure leaf module — no imports, no DOM, no state — so every surface that holds plain text (planners and handbook
   pages today; sheets, the Journal, play-map text boxes, data-map node names and the notepad later) can clean, carry and
   draw a format through the same code, and tools/textcheck.js can run all of it under Node. Published as
   window.wpTextFmt when a window exists.

     cleanFmt(fmt, text)             the ONLY shape a format is ever stored, sent or drawn in: size one of SIZES, color a
                                     strict #rrggbb (lower case), b / i only as true; spans with whole-number offsets inside
                                     the text (never inside a surrogate pair: such an offset moves out to the pair's edge),
                                     sorted, not overlapping (where two overlapped, the later one won on the keys it set),
                                     neighbours of one look merged, a span that adds nothing to the base dropped, at most
                                     MAX_SPANS; every other key ignored; the same again when cleaned twice; undefined when
                                     nothing is left (an empty object is never stored). Only the first MAX_RAW entries of a
                                     span list are read.
     runsOf(text, fmt)               the text cut into runs [{ t, color, b, i }] with the base applied — what every renderer
                                     draws from (text nodes, or escaped text in elements it builds). The size is the field's
                                     own: cleanFmt(fmt, text).size.
     respan(old, new, fmt, caret?)   carries the spans across an edit of the text: a span wholly before the change stays, one
                                     wholly after it moves with it, one the change sits inside grows or shrinks with it, one
                                     the change cut into keeps what survives, one inside what was replaced goes. caret (the
                                     field's selectionStart after the edit) tells a run of equal characters where the edit was.
     apply(fmt, text, s, e, change)  what a press of a control does. change: { b: true } / { i: true } (the control was
                                     pressed: a range that is all bold loses it, any other gains it), { color: '#rrggbb' } or
                                     { color: null } (the default colour), { size: key } or { size: null }. s === e (a caret)
                                     is the whole field's base — a colour then leaves the parts that have their own; a
                                     selection of the whole text paints everything. Size is always the whole field's.
     clear(fmt, text, s, e)          a caret or the whole text: nothing left (undefined); a part: that part plain.
     stateAt(fmt, text, s, e)        what the controls show: { b, i, color ('' the default, null when mixed), size, any }. */
'use strict';

var VERSION = '1.5.0';
var MAX_SPANS = 200;     // kept per field
var MAX_RAW = 400;       // read from a stored list (a longer one is a file's or a host's, never the app's own)
// Size steps: keys, not pixels — each a share of the field's own size, so a page's look and a heading's size still scale.
// Powers of 1.2, the step a browser's own "larger" / "smaller" takes (a flowchart label is sized with those).
var SIZES = ['small', 'large', 'larger', 'huge'];
var SIZE_EM = { small: '0.833em', large: '1.2em', larger: '1.44em', huge: '1.728em' };
var SIZE_NAMES = { small: 'Small', large: 'Large', larger: 'Larger', huge: 'Huge' };
// The app's ink row (the pen's palette on the play map), plus Custom and Default in the bar
var PALETTE = [['#e9e9f0', 'White'], ['#1a1a1a', 'Black'], ['#d9534f', 'Red'], ['#e0a54f', 'Gold'], ['#5cb87a', 'Green'], ['#4db3d3', 'Blue'], ['#b98cff', 'Violet']];

function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function hex(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : ''; }
function sizeKey(v) { return typeof v === 'string' && SIZES.indexOf(v) >= 0 ? v : ''; }
function txt(t) { return t == null ? '' : String(t); }
function whole(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
// offset i would split a surrogate pair
function inPair(t, i) {
    if (i <= 0 || i >= t.length) return false;
    var a = t.charCodeAt(i - 1), b = t.charCodeAt(i);
    return a >= 0xd800 && a <= 0xdbff && b >= 0xdc00 && b <= 0xdfff;
}

function readBase(fmt) {
    var o = { size: '', color: '', b: false, i: false };
    if (!isObj(fmt)) return o;
    if (own(fmt, 'size')) o.size = sizeKey(fmt.size);
    if (own(fmt, 'color')) o.color = hex(fmt.color);
    o.b = own(fmt, 'b') && fmt.b === true;
    o.i = own(fmt, 'i') && fmt.i === true;
    return o;
}
// the spans a stored list really holds, in its own order (a later one wins where two overlap)
function readSpans(fmt, text) {
    var out = [], n = text.length, list = isObj(fmt) && own(fmt, 'spans') && Array.isArray(fmt.spans) ? fmt.spans : [];
    for (var k = 0; k < list.length && k < MAX_RAW; k++) {
        var sp = list[k]; if (!isObj(sp)) continue;
        var s = own(sp, 's') ? sp.s : null, e = own(sp, 'e') ? sp.e : null;
        if (!whole(s) || !whole(e) || s < 0) continue;
        if (e > n) e = n;
        if (s >= e) continue;
        if (inPair(text, s)) s--;
        if (inPair(text, e)) e++;
        var c = own(sp, 'color') ? hex(sp.color) : '', b = own(sp, 'b') && sp.b === true, i = own(sp, 'i') && sp.i === true;
        if (!c && !b && !i) continue;
        out.push({ s: s, e: e, color: c, b: b, i: i });
    }
    return out;
}
// the whole text as intervals of one look each (the base under the spans), neighbours of one look merged
function flatten(text, base, raw) {
    var n = text.length, cuts = [0, n], out = [];
    if (!n) return out;
    raw.forEach(function(sp) { cuts.push(sp.s, sp.e); });
    cuts.sort(function(x, y) { return x - y; });
    for (var k = 0; k + 1 < cuts.length; k++) {
        var a = cuts[k], z = cuts[k + 1]; if (a >= z) continue;
        var color = base.color, b = base.b, i = base.i;
        for (var j = 0; j < raw.length; j++) { var sp = raw[j]; if (sp.s <= a && sp.e >= z) { if (sp.color) color = sp.color; if (sp.b) b = true; if (sp.i) i = true; } }
        var last = out[out.length - 1];
        if (last && last.color === color && last.b === b && last.i === i) last.e = z;
        else out.push({ s: a, e: z, color: color, b: b, i: i });
    }
    return out;
}
// a base every interval can be written against: a base colour only where every part has a colour, bold or italic only where every part is
function fitBase(base, ivs) {
    if (!ivs.length) return base;
    return { size: base.size, color: ivs.every(function(iv) { return !!iv.color; }) ? base.color : '', b: base.b && ivs.every(function(iv) { return iv.b; }), i: base.i && ivs.every(function(iv) { return iv.i; }) };
}
function build(base, ivs) {
    var out = {}, spans = [];
    if (base.size) out.size = base.size;
    if (base.color) out.color = base.color;
    if (base.b) out.b = true;
    if (base.i) out.i = true;
    for (var k = 0; k < ivs.length && spans.length < MAX_SPANS; k++) {
        var iv = ivs[k], sp = { s: iv.s, e: iv.e }, any = false;
        if (iv.color && iv.color !== base.color) { sp.color = iv.color; any = true; }
        if (iv.b && !base.b) { sp.b = true; any = true; }
        if (iv.i && !base.i) { sp.i = true; any = true; }
        if (!any) continue;
        var last = spans[spans.length - 1];
        if (last && last.e === sp.s && last.color === sp.color && last.b === sp.b && last.i === sp.i) last.e = sp.e;
        else spans.push(sp);
    }
    if (spans.length) out.spans = spans;
    return (out.size || out.color || out.b || out.i || out.spans) ? out : undefined;
}

function cleanFmt(fmt, text) {
    if (!isObj(fmt)) return undefined;
    text = txt(text);
    var base = readBase(fmt);
    return build(base, flatten(text, base, readSpans(fmt, text)));
}

function runsOf(text, fmt) {
    text = txt(text);
    if (!text) return [];
    var f = cleanFmt(fmt, text), base = readBase(f);
    return flatten(text, base, readSpans(f, text)).map(function(iv) { return { t: text.slice(iv.s, iv.e), color: iv.color, b: iv.b, i: iv.i }; });
}

function respan(oldText, newText, fmt, caret) {
    oldText = txt(oldText); newText = txt(newText);
    var f = cleanFmt(fmt, oldText);
    if (!f) return undefined;
    if (!f.spans || oldText === newText) return cleanFmt(f, newText);
    var a = oldText.length, z = newText.length, p = 0, q = 0, hinted = false;
    if (whole(caret) && caret >= 0 && caret <= z && z - caret <= a && newText.slice(caret) === oldText.slice(a - (z - caret))) {   // what follows the caret was not typed
        q = z - caret; hinted = true;
        var limP = Math.min(a - q, caret);
        while (p < limP && oldText.charCodeAt(p) === newText.charCodeAt(p)) p++;
    }
    if (!hinted) {
        var lim = Math.min(a, z);
        while (p < lim && oldText.charCodeAt(p) === newText.charCodeAt(p)) p++;
        while (q < lim - p && oldText.charCodeAt(a - 1 - q) === newText.charCodeAt(z - 1 - q)) q++;
    }
    var oe = a - q, d = z - a, spans = [];   // the old text's [p, oe) became the new text's [p, oe + d)
    f.spans.forEach(function(sp) {
        var s, e;
        if (sp.e <= p) { s = sp.s; e = sp.e; }
        else if (sp.s >= oe) { s = sp.s + d; e = sp.e + d; }
        else if (sp.s < p && sp.e > oe) { s = sp.s; e = sp.e + d; }   // the change sits inside it
        else if (sp.s < p) { s = sp.s; e = p; }                       // its end was replaced
        else if (sp.e > oe) { s = oe + d; e = sp.e + d; }             // its start was replaced
        else return;                                                  // all of it was replaced
        var o = { s: s, e: e };
        if (sp.color) o.color = sp.color; if (sp.b) o.b = true; if (sp.i) o.i = true;
        spans.push(o);
    });
    var out = {};
    if (f.size) out.size = f.size; if (f.color) out.color = f.color; if (f.b) out.b = true; if (f.i) out.i = true;
    out.spans = spans;
    return cleanFmt(out, newText);
}

// a selection as two offsets inside the text, in order, never inside a surrogate pair
function range(text, s, e) {
    var n = text.length;
    s = whole(s) ? Math.max(0, Math.min(n, s)) : 0;
    e = whole(e) ? Math.max(0, Math.min(n, e)) : s;
    if (e < s) { var t = s; s = e; e = t; }
    if (s !== e) { if (inPair(text, s)) s--; if (inPair(text, e)) e++; }
    return { s: s, e: e };
}
// cut the intervals at s and e; the ones inside [s, e) come back
function inside(ivs, s, e) {
    for (var k = 0; k < ivs.length; k++) {
        var iv = ivs[k];
        [s, e].forEach(function(at) {
            if (at > iv.s && at < iv.e) { ivs.splice(k + 1, 0, { s: at, e: iv.e, color: iv.color, b: iv.b, i: iv.i }); iv.e = at; }
        });
    }
    return ivs.filter(function(iv) { return iv.s >= s && iv.e <= e; });
}
function opened(fmt, text, s, e) {
    var f = cleanFmt(fmt, text), base = readBase(f), ivs = flatten(text, base, readSpans(f, text)), r = range(text, s, e);
    var all = r.s === r.e || (r.s === 0 && r.e === text.length);
    return { base: base, ivs: ivs, r: r, caret: r.s === r.e, all: all, part: all ? ivs : inside(ivs, r.s, r.e) };
}

function apply(fmt, text, s, e, change) {
    text = txt(text);
    var o = opened(fmt, text, s, e), base = o.base;
    change = isObj(change) ? change : {};
    if (own(change, 'size')) base.size = sizeKey(change.size);
    ['b', 'i'].forEach(function(k) {
        if (!(own(change, k) && change[k] === true)) return;
        var on = !(o.part.length ? o.part.every(function(iv) { return iv[k]; }) : base[k]);   // a range that is all bold loses it
        o.part.forEach(function(iv) { iv[k] = on; });
        if (o.all) base[k] = on;
    });
    if (own(change, 'color')) {
        var given = change.color, c = (given == null || given === '') ? '' : hex(given);   // null: the default colour; a value that is no colour changes nothing
        if (given != null && given !== '' && !c) { /* not a colour */ }
        else if (o.caret) { o.ivs.forEach(function(iv) { if (iv.color === base.color) iv.color = c; }); base.color = c; }   // the base alone: a part with a colour of its own keeps it
        else { o.part.forEach(function(iv) { iv.color = c; }); if (o.all) base.color = c; }
    }
    return build(fitBase(base, o.ivs), o.ivs);
}

function clear(fmt, text, s, e) {
    text = txt(text);
    var o = opened(fmt, text, s, e);
    if (o.all) return undefined;
    o.part.forEach(function(iv) { iv.color = ''; iv.b = false; iv.i = false; });
    return build(fitBase(o.base, o.ivs), o.ivs);
}

function stateAt(fmt, text, s, e) {
    text = txt(text);
    var f = cleanFmt(fmt, text), o = opened(f, text, s, e), part = o.part, base = o.base;
    var color = part.length ? (part.every(function(iv) { return iv.color === part[0].color; }) ? part[0].color : null) : base.color;
    return { b: part.length ? part.every(function(iv) { return iv.b; }) : base.b, i: part.length ? part.every(function(iv) { return iv.i; }) : base.i, color: color, size: base.size, any: !!f };
}

var API = { VERSION: VERSION, MAX_SPANS: MAX_SPANS, MAX_RAW: MAX_RAW, SIZES: SIZES.slice(), SIZE_EM: SIZE_EM, SIZE_NAMES: SIZE_NAMES, PALETTE: PALETTE, cleanFmt: cleanFmt, runsOf: runsOf, respan: respan, apply: apply, clear: clear, stateAt: stateAt };
if (typeof window !== 'undefined') window.wpTextFmt = API;
export { VERSION, MAX_SPANS, MAX_RAW, SIZES, SIZE_EM, SIZE_NAMES, PALETTE, cleanFmt, runsOf, respan, apply, clear, stateAt };

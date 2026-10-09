/* Text formats (1.5.0) — the styling of ONE plain text field, stored beside the text, never inside it.
   A title, a table cell, a flowchart node's label stay the plain strings they always were; what the bar on a field's box
   does to them is a small object kept next to the value it belongs to:

     { size?, color?, b?, i?, u?, st?, link?, spans? }      the base, for the whole field
     spans: [{ s, e, size?, color?, b?, i?, u?, st?, link? }]   parts with a look of their own; s and e are JavaScript string offsets

   b bold, i italic, u underlined, st struck through (a span's s is its start, so the strike is st everywhere), link a web address.

   A pure leaf module — no imports, no DOM, no state — so every surface that holds plain text (planners and handbook
   pages today; sheets, the Journal, play-map text boxes, data-map node names and the notepad later) can clean, carry and
   draw a format through the same code, and tools/textcheck.js can run all of it under Node. Published as
   window.wpTextFmt when a window exists.

     cleanFmt(fmt, text)             the ONLY shape a format is ever stored, sent or drawn in: size one of SIZES, color a
                                     strict #rrggbb (lower case), b / i / u / st only as true, link a web address as cleanLink
                                     keeps one; spans with whole-number offsets inside
                                     the text (never inside a surrogate pair: such an offset moves out to the pair's edge),
                                     sorted, not overlapping (where two overlapped, the later one won on the keys it set),
                                     neighbours of one look merged, a span that adds nothing to the base dropped, at most
                                     MAX_SPANS; every other key ignored; the same again when cleaned twice; undefined when
                                     nothing is left (an empty object is never stored). Only the first MAX_RAW entries of a
                                     span list are read. A size and a link are the base's only when EVERY character has that
                                     one (then no span carries one); where the characters differ, each part's is on its span —
                                     so a format says one thing one way, whoever wrote it.
     cleanLink(v)                    the one rule for what a link may be — the page sanitiser's rule for an <a href>
                                     (docrender.js safeHref), stated here because this module imports nothing; tools/textcheck.js
                                     runs both on one corpus and demands the same verdict for every entry. A string, trimmed,
                                     that begins http:// or https:// (any case) with something after it, holds no white space
                                     and no control character, and is at most MAX_LINK long; anything else is '' (no link: the
                                     text stays).
     typedLink(typed)                what an address typed into a Link box becomes, in one place: trimmed, one without its scheme
                                     taken as https:// (a name with a port too); '' for an empty box; null for what cleanLink refuses.
     linkParts(text)                 the web addresses in a plain text, for a view that reads it (the Journal): parts [{ t }, { t, href }],
                                     a link's text exactly the characters typed and its href what cleanLink keeps of them; the parts
                                     joined are the text; at most MAX_TEXT_LINKS links. The edges are written above the function.
     runsOf(text, fmt)               the text cut into runs [{ t, color, b, i, u, st, size, link }] with the base applied — what
                                     every renderer draws from (text nodes, or escaped text in elements it builds). A run has one
                                     size: its span's, or else the field's.
     respan(old, new, fmt, caret?, apart?)
                                     carries the spans across an edit of the text: a span wholly before the change stays, one
                                     wholly after it moves with it, one the change sits inside grows or shrinks with it, one
                                     the change cut into keeps what survives, one inside what was replaced goes. What is typed
                                     (or pasted) right AFTER a span joins it, as in a word processor — the span grows; typed
                                     right BEFORE one it does not (it takes what is before it), and between two touching spans
                                     it is the left one's. A line break ends a span's reach: a typed run that begins with one,
                                     or one typed after a line break that is the span's last character, stays outside (a line
                                     begun with Enter after a styled line is not styled). A deletion never grows a span. caret
                                     (the field's selectionStart after the edit) tells a run of equal characters where the edit was.
                                     An edit never begins or ends inside a surrogate pair (two emoji that share half their code are
                                     two whole characters). apart === true: the edit is not typing (the browser's own undo or redo
                                     put the text there) — the spans are carried the same and nothing joins.
     apply(fmt, text, s, e, change)  what a press of a control does. change: { b: true } / { i: true } / { u: true } / { st: true }
                                     (the control was pressed: a range that is all bold loses it, any other gains it),
                                     { color: '#rrggbb' } or { color: null } (the default colour), { size: key } or { size: null },
                                     { link: address } or { link: null }. s === e (a caret) is the whole field: a colour then is
                                     the base's and leaves the parts that have their own; a size and a link are every
                                     character's. A selection takes the change on its characters alone. A value that is no
                                     colour, no size or no link changes nothing.
     clear(fmt, text, s, e)          a caret or the whole text: nothing left (undefined); a part: that part plain.
     stateAt(fmt, text, s, e)        what the controls show: { b, i, u, st, color, size, link, any } — color, size and link
                                     '' for none and null where the range holds more than one.

   Waypoint's own typefaces (1.5.4). A text's font is one of FONTS, by its name: each is a file of the app (assets/fonts, its licence
   text beside it, an @font-face rule of style.css), so a text looks the same on every computer and no font is read from the computer
   it is shown on.

     FONTS                           [name, generic, group] each, in the order a list offers them: the name is what a text stores
                                     and what the font's @font-face rule calls the family.
     fontKnown(v)                    the list's own spelling of a font it holds (asked without regard to case), else ''.
     cleanFont(v)                    the ONLY shape a font is stored, sent or drawn in: a font of the list under the list's
                                     spelling; else a plain family name as it is (letters, digits, spaces, hyphens and
                                     underscores, beginning with a letter or a digit, MAX_FONT at most): a text box from before
                                     1.5.4 named one of the computer's own fonts and keeps it; anything else undefined, and so is
                                     a word CSS reads as an instruction (inherit, initial, unset, revert, revert-layer, default).
     fontCss(v)                      the font-family a stored font is drawn with: '"Name", generic' for a font of the list,
                                     '"Name"' for another plain family name, a generic family's own word as it is, '' (the
                                     app's own font) for anything else. Never a value that could end the declaration it goes in. */
'use strict';

var VERSION = '1.5.0';
var MAX_SPANS = 200;     // kept per field
var MAX_RAW = 400;       // read from a stored list (a longer one is a file's or a host's, never the app's own)
var MAX_LINK = 2000;     // a link's length (the page sanitiser's own cap for an <a href>)
var MAX_TEXT_LINKS = 200; // links made of one plain text by linkParts (the addresses after them stay text)
// Size steps: keys, not pixels — each a share of the field's own size, so a page's look and a heading's size still scale.
// Powers of 1.2, the step a browser's own "larger" / "smaller" takes (a flowchart label is sized with those).
var SIZES = ['small', 'large', 'larger', 'huge'];
var SIZE_EM = { small: '0.833em', large: '1.2em', larger: '1.44em', huge: '1.728em' };
var SIZE_NAMES = { small: 'Small', large: 'Large', larger: 'Larger', huge: 'Huge' };
// The app's ink row (the pen's palette on the play map), plus Custom and Default in the bar
var PALETTE = [['#e9e9f0', 'White'], ['#1a1a1a', 'Black'], ['#d9534f', 'Red'], ['#e0a54f', 'Gold'], ['#5cb87a', 'Green'], ['#4db3d3', 'Blue'], ['#b98cff', 'Violet']];
var LOOKS = ['size', 'color', 'b', 'i', 'u', 'st', 'link'];   // a look's keys, in the order they are stored
// [textcheck:fonts-start]
// Waypoint's own typefaces: [name, generic, group]. One entry a family; tools/systemcheck.js holds each to its file, its licence text and
// its @font-face rule. Inter is the one the sheet looks already carried.
var FONTS = [
    ['Inter', 'sans-serif', 'Reading'], ['Lora', 'serif', 'Reading'], ['Crimson Text', 'serif', 'Reading'], ['Comic Neue', 'sans-serif', 'Reading'],
    ['Cinzel', 'serif', 'Old and fantasy'], ['IM Fell English', 'serif', 'Old and fantasy'], ['Almendra', 'serif', 'Old and fantasy'], ['MedievalSharp', 'serif', 'Old and fantasy'],
    ['Uncial Antiqua', 'serif', 'Old and fantasy'], ['UnifrakturCook', 'serif', 'Old and fantasy'], ['Pirata One', 'serif', 'Old and fantasy'],
    ['Caveat', 'cursive', 'Handwriting'], ['Great Vibes', 'cursive', 'Handwriting'],
    ['Orbitron', 'sans-serif', 'Science fiction'], ['Audiowide', 'sans-serif', 'Science fiction'], ['Black Ops One', 'sans-serif', 'Science fiction'], ['Share Tech Mono', 'monospace', 'Science fiction'],
    ['Cutive Mono', 'monospace', 'Typewriter and code'], ['JetBrains Mono', 'monospace', 'Typewriter and code'],
    ['Rye', 'serif', 'Display'], ['Bangers', 'sans-serif', 'Display'], ['Nosifer', 'sans-serif', 'Display'],
    ['Noto Sans Runic', 'sans-serif', 'Runes']
];
var MAX_FONT = 60;       // a font name's length
var FONT_WIDE = ['inherit', 'initial', 'unset', 'revert', 'revert-layer', 'default'];   // words CSS reads as an instruction, never as a family: no font is stored or drawn under one
var FONT_GENERIC = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong'];   // a generic family is a keyword: written without quotes (a quoted one would be the name of a font no computer has)
function fontKnown(v) {
    if (typeof v !== 'string') return '';
    var t = v.trim().toLowerCase(); if (!t) return '';
    for (var i = 0; i < FONTS.length; i++) if (FONTS[i][0].toLowerCase() === t) return FONTS[i][0];
    return '';
}
function cleanFont(v) {
    if (typeof v !== 'string') return undefined;
    var k = fontKnown(v); if (k) return k;
    var t = v.trim();
    if (FONT_WIDE.indexOf(t.toLowerCase()) >= 0) return undefined;
    return (t.length <= MAX_FONT && /^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(t)) ? t : undefined;   // a plain family name: nothing that could end a declaration, open a function or begin a second family
}
function fontCss(v) {
    var f = cleanFont(v); if (!f) return '';
    for (var i = 0; i < FONTS.length; i++) if (FONTS[i][0] === f) return '"' + f + '", ' + FONTS[i][1];
    return FONT_GENERIC.indexOf(f.toLowerCase()) >= 0 ? f.toLowerCase() : '"' + f + '"';
}
// [textcheck:fonts-end]

function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function hex(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : ''; }
function sizeKey(v) { return typeof v === 'string' && SIZES.indexOf(v) >= 0 ? v : ''; }
// [textcheck:linkrule-start]
// The page sanitiser's rule for a link (docrender.js safeHref), on a plain address: trimmed, no control character and no white space
// left in it, not over-long, and http:// or https:// with something after it. '' for anything else.
function cleanLink(v) {
    if (typeof v !== 'string') return '';
    v = v.trim();
    if (/[\u0000-\u001f\u007f\s]/.test(v) || v.length > MAX_LINK) return '';
    return /^https?:\/\/.+/i.test(v) ? v : '';
}
// [textcheck:linkrule-end]
// What a typed address becomes — the ONE reading, for every box an address is typed into (the Link box of the bar on a planner field's
// box, and of a text block's own bar). Trimmed. An address typed without its scheme ("example.com/page") is taken as the secure web
// scheme — one with a port too ("example.com:8080/page", "localhost:3000": a first word followed by one to five digits and then the end,
// a /, a ? or a # is a host and its port, not a scheme). '' for an empty box (the link comes off); null for anything that is still no
// link by cleanLink (so whatever begins with another scheme): the caller says so and changes nothing.
function typedLink(v) {
    v = txt(v).trim();
    if (v && !/^[a-z][a-z0-9+.-]*:(?!\d{1,5}(?:[\/?#]|$))/i.test(v)) v = 'https://' + v;
    return v && !cleanLink(v) ? null : v;
}
// [textcheck:linkparts-start]
// The web addresses in a plain text, for a view that reads it (the Journal): the text cut into parts [{ t }, { t, href }] — a part with
// an href is an address, its text exactly the characters that were typed, its href that same string as cleanLink keeps it. The parts
// joined are the text. Nothing here says what a link is: an address is the letters and digits right before a "://" and everything after
// it up to the first character an address cannot hold, and it is a link only when cleanLink keeps that whole string.
//   - Where it ends: at the first character cleanLink refuses inside an address (asked of cleanLink itself, once per character), and at
//     < or > (an address in angle brackets is the address alone).
//   - What trails it and is not part of it: . , ; : ! ? and a closing bracket or quote that was not opened inside the address — so
//     "(see <address>)." and an address in quotes link the address alone, and one that holds its own (…) keeps it.
//   - What begins it: the scheme is the run of letters and digits right before "://". One glued to a letter or a digit before it is that
//     longer word, which is no scheme the rule knows; a bare name with no scheme is never a link.
//   - Two addresses with nothing between them are one address: the second is part of the first, as an address bar would read it.
//   - An address longer than the rule allows is no link at all (never a link to its first part); at most MAX_TEXT_LINKS links a text —
//     the first ones — and the addresses after them stay text.
// One pass: every character is looked at a fixed number of times, whatever the text holds.
var TRAIL = '.,;:!?';
var OPENER = { ')': '(', ']': '[', '}': '{', '”': '“', '’': '‘', '»': '«' };   // a closer and what opens it
var EITHER = '"\'';                                                             // a quote that opens and closes alike
var _ends = Object.create(null);
function endsAddress(code) {
    if (code === 60 || code === 62) return true;   // < and >
    var k = _ends[code];
    if (k === undefined) k = _ends[code] = cleanLink('http://a' + String.fromCharCode(code) + 'a') === '';
    return k;
}
function schemeChar(code) { return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122); }
// where the address that begins at s really ends, given the run [s, e): less what trails it
function addressEnd(text, s, e) {
    var counts = null;
    while (e > s) {
        var ch = text.charAt(e - 1);
        if (TRAIL.indexOf(ch) >= 0) { e--; continue; }
        var closer = own(OPENER, ch), quote = EITHER.indexOf(ch) >= 0;
        if (!closer && !quote) break;
        if (!counts) { counts = Object.create(null); for (var i = s; i < e; i++) { var c = text.charAt(i); counts[c] = (counts[c] || 0) + 1; } }
        var unopened = quote ? counts[ch] % 2 === 1 : (counts[OPENER[ch]] || 0) < counts[ch];
        if (!unopened) break;
        counts[ch]--; e--;
    }
    return e;
}
function linkParts(text) {
    text = txt(text);
    var n = text.length, parts = [], last = 0, from = 0, links = 0;
    while (from < n && links < MAX_TEXT_LINKS) {
        var k = text.indexOf('://', from);
        if (k < 0) break;
        var s = k, e = k + 3;
        while (s > last && schemeChar(text.charCodeAt(s - 1))) s--;
        while (e < n && !endsAddress(text.charCodeAt(e))) e++;
        from = e;
        if (s === k) continue;   // no scheme before it
        var z = addressEnd(text, s, e), cand = text.slice(s, z);
        if (cleanLink(cand) !== cand) continue;
        if (s > last) parts.push({ t: text.slice(last, s) });
        parts.push({ t: cand, href: cand });
        last = z; links++;
    }
    if (last < n) parts.push({ t: text.slice(last) });
    return parts;
}
// [textcheck:linkparts-end]
function txt(t) { return t == null ? '' : String(t); }
function whole(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
function isBreak(code) { return code === 10 || code === 13; }   // a line break (a flowchart label's \n; \r for a text from elsewhere)
// offset i would split a surrogate pair
function inPair(t, i) {
    if (i <= 0 || i >= t.length) return false;
    var a = t.charCodeAt(i - 1), b = t.charCodeAt(i);
    return a >= 0xd800 && a <= 0xdbff && b >= 0xdc00 && b <= 0xdfff;
}

// A look: what one stretch of text is drawn with. Read from an object's OWN keys only, each through its cleaner.
function readLook(o) {
    var l = { size: '', color: '', b: false, i: false, u: false, st: false, link: '' };
    if (!isObj(o)) return l;
    if (own(o, 'size')) l.size = sizeKey(o.size);
    if (own(o, 'color')) l.color = hex(o.color);
    l.b = own(o, 'b') && o.b === true;
    l.i = own(o, 'i') && o.i === true;
    l.u = own(o, 'u') && o.u === true;
    l.st = own(o, 'st') && o.st === true;
    if (own(o, 'link')) l.link = cleanLink(o.link);
    return l;
}
function hasLook(l) { return !!(l.size || l.color || l.b || l.i || l.u || l.st || l.link); }
function sameLook(x, y) { return x.size === y.size && x.color === y.color && x.b === y.b && x.i === y.i && x.u === y.u && x.st === y.st && x.link === y.link; }
function piece(s, e, l) { return { s: s, e: e, size: l.size, color: l.color, b: l.b, i: l.i, u: l.u, st: l.st, link: l.link }; }
function readBase(fmt) { return readLook(fmt); }
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
        var l = readLook(sp);
        if (!hasLook(l)) continue;
        out.push(piece(s, e, l));
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
        var iv = piece(a, z, base);
        for (var j = 0; j < raw.length; j++) {
            var sp = raw[j]; if (!(sp.s <= a && sp.e >= z)) continue;
            if (sp.size) iv.size = sp.size; if (sp.color) iv.color = sp.color; if (sp.link) iv.link = sp.link;
            if (sp.b) iv.b = true; if (sp.i) iv.i = true; if (sp.u) iv.u = true; if (sp.st) iv.st = true;
        }
        var last = out[out.length - 1];
        if (last && sameLook(last, iv)) last.e = z;
        else out.push(iv);
    }
    return out;
}
// A base every interval can be written against: a base colour only where every part has a colour; bold, italic, underline, strike only
// where every part is; a size and a link only where every part has that very one — and then it IS the base's, whoever set it (so a
// field of one size, or one link, is always stored as the field's own and a part's size or link is always on a span).
function fitBase(base, ivs) {
    if (!ivs.length) return base;
    var all = function(k) { return base[k] && ivs.every(function(iv) { return iv[k]; }); };
    var one = function(k) { var v = ivs[0][k]; return v && ivs.every(function(iv) { return iv[k] === v; }) ? v : ''; };
    return { size: one('size'), color: ivs.every(function(iv) { return !!iv.color; }) ? base.color : '', b: all('b'), i: all('i'), u: all('u'), st: all('st'), link: one('link') };
}
function build(base, ivs) {
    var out = {}, spans = [];
    if (base.size) out.size = base.size;
    if (base.color) out.color = base.color;
    if (base.b) out.b = true;
    if (base.i) out.i = true;
    if (base.u) out.u = true;
    if (base.st) out.st = true;
    if (base.link) out.link = base.link;
    for (var k = 0; k < ivs.length && spans.length < MAX_SPANS; k++) {
        var iv = ivs[k], sp = { s: iv.s, e: iv.e }, any = false;
        if (iv.size && iv.size !== base.size) { sp.size = iv.size; any = true; }
        if (iv.color && iv.color !== base.color) { sp.color = iv.color; any = true; }
        if (iv.b && !base.b) { sp.b = true; any = true; }
        if (iv.i && !base.i) { sp.i = true; any = true; }
        if (iv.u && !base.u) { sp.u = true; any = true; }
        if (iv.st && !base.st) { sp.st = true; any = true; }
        if (iv.link && iv.link !== base.link) { sp.link = iv.link; any = true; }
        if (!any) continue;
        var last = spans[spans.length - 1];
        if (last && last.e === sp.s && last.size === sp.size && last.color === sp.color && last.b === sp.b && last.i === sp.i && last.u === sp.u && last.st === sp.st && last.link === sp.link) last.e = sp.e;
        else spans.push(sp);
    }
    if (spans.length) out.spans = spans;
    return (out.size || out.color || out.b || out.i || out.u || out.st || out.link || out.spans) ? out : undefined;
}

function cleanFmt(fmt, text) {
    if (!isObj(fmt)) return undefined;
    text = txt(text);
    var base = readBase(fmt), ivs = flatten(text, base, readSpans(fmt, text));
    return build(fitBase(base, ivs), ivs);
}

function runsOf(text, fmt) {
    text = txt(text);
    if (!text) return [];
    var f = cleanFmt(fmt, text), base = readBase(f);
    return flatten(text, base, readSpans(f, text)).map(function(iv) { return { t: text.slice(iv.s, iv.e), color: iv.color, b: iv.b, i: iv.i, u: iv.u, st: iv.st, size: iv.size, link: iv.link }; });
}

// a cleaned look's keys copied onto o (only the ones that are set)
function lookInto(o, from) { LOOKS.forEach(function(k) { if (from[k]) o[k] = from[k]; }); return o; }

function respan(oldText, newText, fmt, caret, apart) {
    oldText = txt(oldText); newText = txt(newText);
    var f = cleanFmt(fmt, oldText);
    if (!f) return undefined;
    if (!f.spans || oldText === newText) return cleanFmt(f, newText);
    var a = oldText.length, z = newText.length, p = 0, q = 0, hinted = false;
    if (whole(caret) && caret >= 0 && caret <= z && z - caret <= a && newText.slice(caret) === oldText.slice(a - (z - caret))) {   // what follows the caret was not typed
        q = z - caret; hinted = true;
        var limP = Math.min(a - q, caret);
        while (p < limP && oldText.charCodeAt(p) === newText.charCodeAt(p)) p++;
        if (inPair(oldText, p) || inPair(newText, p)) p--;   // the change never begins inside a pair: two emoji may share their first half
    }
    if (!hinted) {
        var lim = Math.min(a, z);
        while (p < lim && oldText.charCodeAt(p) === newText.charCodeAt(p)) p++;
        if (inPair(oldText, p) || inPair(newText, p)) p--;
        while (q < lim - p && oldText.charCodeAt(a - 1 - q) === newText.charCodeAt(z - 1 - q)) q++;
    }
    if (inPair(oldText, a - q) || inPair(newText, z - q)) q--;   // nor ends inside one (or their second half)
    var oe = a - q, d = z - a, typed = oe + d - p, spans = [];   // the old text's [p, oe) became the new text's [p, p + typed)
    // What was typed joins the span that ends where it begins — unless it begins with a line break, or follows one (a new line is not the styled line's)
    // — and never when the edit is not typing (apart)
    var joins = apart !== true && typed > 0 && p > 0 && !isBreak(newText.charCodeAt(p)) && !isBreak(newText.charCodeAt(p - 1));
    f.spans.forEach(function(sp) {
        var s, e;
        if (sp.e < p || (sp.e === p && !joins)) { s = sp.s; e = sp.e; }
        else if (sp.e === p) { s = sp.s; e = p + typed; }             // typed right after it: it grows
        else if (sp.s >= oe) { s = sp.s + d; e = sp.e + d; }
        else if (sp.s < p && sp.e > oe) { s = sp.s; e = sp.e + d; }   // the change sits inside it
        else if (sp.s < p) { s = sp.s; e = joins ? p + typed : p; }   // its end was replaced: what was typed there joins what is left of it
        else if (sp.e > oe) { s = oe + d; e = sp.e + d; }             // its start was replaced
        else return;                                                  // all of it was replaced
        spans.push(lookInto({ s: s, e: e }, sp));
    });
    var out = lookInto({}, f);
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
            if (at > iv.s && at < iv.e) { ivs.splice(k + 1, 0, piece(at, iv.e, iv)); iv.e = at; }
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
    ['b', 'i', 'u', 'st'].forEach(function(k) {
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
    // a size and a link: the characters of the range — every character with nothing selected (a text with none yet: the base)
    [['size', sizeKey], ['link', cleanLink]].forEach(function(kc) {
        var k = kc[0]; if (!own(change, k)) return;
        var g = change[k], v = (g == null || g === '') ? '' : kc[1](g);
        if (g != null && g !== '' && !v) return;   // not a size, not a link: nothing changes
        o.part.forEach(function(iv) { iv[k] = v; });
        if (!o.ivs.length) base[k] = v;
    });
    return build(fitBase(base, o.ivs), o.ivs);
}

function clear(fmt, text, s, e) {
    text = txt(text);
    var o = opened(fmt, text, s, e);
    if (o.all) return undefined;
    o.part.forEach(function(iv) { iv.size = ''; iv.color = ''; iv.b = false; iv.i = false; iv.u = false; iv.st = false; iv.link = ''; });
    return build(fitBase(o.base, o.ivs), o.ivs);
}

function stateAt(fmt, text, s, e) {
    text = txt(text);
    var f = cleanFmt(fmt, text), o = opened(f, text, s, e), part = o.part, base = o.base;
    var all = function(k) { return part.length ? part.every(function(iv) { return iv[k]; }) : base[k]; };
    var one = function(k) { return part.length ? (part.every(function(iv) { return iv[k] === part[0][k]; }) ? part[0][k] : null) : base[k]; };   // null: more than one
    return { b: all('b'), i: all('i'), u: all('u'), st: all('st'), color: one('color'), size: one('size'), link: one('link'), any: !!f };
}

var API = { VERSION: VERSION, MAX_SPANS: MAX_SPANS, MAX_RAW: MAX_RAW, MAX_LINK: MAX_LINK, SIZES: SIZES.slice(), SIZE_EM: SIZE_EM, SIZE_NAMES: SIZE_NAMES, PALETTE: PALETTE, FONTS: FONTS, MAX_FONT: MAX_FONT, fontKnown: fontKnown, cleanFont: cleanFont, fontCss: fontCss, cleanFmt: cleanFmt, cleanLink: cleanLink, typedLink: typedLink, linkParts: linkParts, MAX_TEXT_LINKS: MAX_TEXT_LINKS, runsOf: runsOf, respan: respan, apply: apply, clear: clear, stateAt: stateAt };
if (typeof window !== 'undefined') window.wpTextFmt = API;
export { VERSION, MAX_SPANS, MAX_RAW, MAX_LINK, MAX_TEXT_LINKS, SIZES, SIZE_EM, SIZE_NAMES, PALETTE, FONTS, MAX_FONT, fontKnown, cleanFont, fontCss, cleanFmt, cleanLink, typedLink, linkParts, runsOf, respan, apply, clear, stateAt };

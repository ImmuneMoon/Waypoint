/* The look of a text OUTSIDE a planner (1.5.4, item 35): a sheet's text field, a Journal note of your own, the table notepad.
   A planner keeps a field's format beside the field, in its own block, and nothing can change the field without going through the
   editor. Elsewhere a text is changed from many places (a wire edit, an import, a rule, an older app that knows nothing of looks),
   so its look is a RECORD that names the very text it was made for:

     { fmt?, font?, sig }      fmt: a format as textfmt.js cleanFmt keeps one; font: one of Waypoint's own typefaces; sig: the
                               text's signature. Keys in that order. Never an empty record: no fmt and no font is no record.

   THE ONE STALE RULE. A record whose sig is not the signature of the text beside it is no record: the text is drawn plain. So a
   look can never land on other words, whoever changed the text, and nothing has to hunt a look down when a text changes.

   A RULE says what a place takes: { size, link, font, multi, max }. LINE a sheet's one-line text; NOTES a sheet's notes; NOTE a
   Journal note of your own; PAD the table notepad. A look is cleaned BY A RULE on every machine that stores, sends or draws it:
   what the rule does not take is dropped, never refused, so an older record or a host's still reads.

   A pure module: it imports textfmt.js and nothing else, has no DOM and no state, and runs under Node (tools/textcheck.js).
   Published as window.wpLook when a window exists.

     textSig(text)                 length + ':' + eight hex digits (FNV-1a, 32 bits, over the text's UTF-16 code units, low byte first).
                                   A signature tells a changed text apart: it is no secret and no proof of who wrote anything.
     lookShapeOk(fmt)              the SHAPE of a format before anything reads it: a plain object (no array, no view, no prototype of
                                   its own) whose own keys are a look's, each a primitive (a string at most MAX_LINK long), with
                                   spans an array of at most MAX_RAW plain entries of the same kind. Bounded work, nothing
                                   stringified. Everything fieldLook gives passes it.
     recShapeOk(rec)               the shape of a record: a plain object with no key but fmt, font and sig, the sig a signature's
                                   form, the font a short string, the fmt passing lookShapeOk.
     fieldLook(fmt, text, rule)    a format as the rule takes it: cleaned, a size and a link dropped where the rule has none, at
                                   most LINKS linked parts and LINK_CHARS characters of address a field (a part past either keeps
                                   its text and the rest of its look, and loses only its link), cleaned again. undefined for none.
                                   The same again when given its own answer.
     cleanRec(rec, text, rule)     the ONLY shape a record is stored, sent or drawn in, for THIS text: undefined unless the text is
                                   a string within the rule's length, the record has a record's shape and its sig is the text's.
     makeRec(fmt, font, text, rule)   a record for a text from a format and a font: what an edit stores. undefined for none.
     lookWeight(rec)               a record's size for a budget: its strings' lengths and 48 a part. */
'use strict';
import { cleanFmt, fontKnown, MAX_RAW, MAX_LINK, MAX_FONT } from './textfmt.js';

// [textcheck:lookcore-start]
var LINKS = 20;            // linked parts a field keeps
var LINK_CHARS = 8000;     // characters of address a field keeps, all its links together
var SIG_MAX = 9999999;     // the longest text a signature's form can name
var RULES = {
    LINE: { size: false, link: true, font: false, multi: false, max: 0 },        // a sheet's one-line text: no size (the owner, 2026-10-09: "No size there")
    NOTES: { size: true, link: true, font: false, multi: true, max: 0 },         // a sheet's notes
    NOTE: { size: true, link: true, font: true, multi: true, max: 60000 },       // a Journal note of your own
    PAD: { size: true, link: false, font: true, multi: true, max: 20000 }        // the table notepad: read by everyone at the table, so no link
};
Object.keys(RULES).forEach(function(k) { Object.freeze(RULES[k]); }); Object.freeze(RULES);   // a rule is a fact of the app: no caller changes one
var FMT_KEYS = ['size', 'color', 'b', 'i', 'u', 'st', 'link', 'spans'], SPAN_KEYS = ['s', 'e', 'size', 'color', 'b', 'i', 'u', 'st', 'link'], REC_KEYS = ['fmt', 'font', 'sig'];

function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
// a plain object: made by a literal or by JSON, with no prototype of its own (what a prototype holds is never read here)
function plain(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o) || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(o))) return false;
    var p = Object.getPrototypeOf(o);
    return p === Object.prototype || p === null;
}
function prim(v) { var t = typeof v; return v === null || v === undefined || t === 'boolean' || t === 'number' || (t === 'string' && v.length <= MAX_LINK); }
function keysOk(o, allowed, list) {
    var ks = Object.keys(o);
    if (ks.length > allowed.length) return false;
    for (var i = 0; i < ks.length; i++) { if (allowed.indexOf(ks[i]) < 0) return false; if (ks[i] !== list && !prim(o[ks[i]])) return false; }
    return true;
}
// what a rule takes, read with care: only true is a yes, and a rule that is no object takes nothing
function ruleOf(rule) {
    var r = plain(rule) ? rule : {}, m = typeof r.max === 'number' && isFinite(r.max) && r.max > 0 ? Math.floor(r.max) : 0;
    return { size: r.size === true, link: r.link === true, font: r.font === true, multi: r.multi === true, max: m };
}

function textSig(text) {
    var s = typeof text === 'string' ? text : '', h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h = Math.imul(h ^ (c & 0xff), 0x01000193); h = Math.imul(h ^ (c >>> 8), 0x01000193); }
    return s.length + ':' + ('0000000' + (h >>> 0).toString(16)).slice(-8);
}
function lookShapeOk(fmt) {
    if (!plain(fmt) || !keysOk(fmt, FMT_KEYS, 'spans')) return false;
    if (!own(fmt, 'spans') || fmt.spans === undefined) return true;
    var l = fmt.spans; if (!Array.isArray(l) || l.length > MAX_RAW) return false;
    for (var i = 0; i < l.length; i++) if (!plain(l[i]) || !keysOk(l[i], SPAN_KEYS, '')) return false;
    return true;
}
function recShapeOk(rec) {
    if (!plain(rec) || !keysOk(rec, REC_KEYS, 'fmt')) return false;
    if (typeof rec.sig !== 'string' || rec.sig.length > 16 || !/^\d{1,7}:[0-9a-f]{8}$/.test(rec.sig)) return false;
    if (own(rec, 'font') && rec.font !== undefined && (typeof rec.font !== 'string' || rec.font.length > MAX_FONT)) return false;
    return !own(rec, 'fmt') || rec.fmt === undefined || lookShapeOk(rec.fmt);
}
function fieldLook(fmt, text, rule) {
    var R = ruleOf(rule), f = cleanFmt(fmt, text);
    if (!f) return undefined;
    var out = {}, n = 0, chars = 0, k;
    // a link is kept while the field has room for it: at most LINKS of them, and LINK_CHARS characters of address in all
    var room = function(link) { if (!R.link || typeof link !== 'string' || !link || n >= LINKS || chars + link.length > LINK_CHARS) return false; n++; chars += link.length; return true; };
    for (k in f) if (own(f, k) && k !== 'spans' && !(k === 'size' && !R.size) && !(k === 'link' && !R.link)) out[k] = f[k];   // (a link that is the whole field's is one link of at most MAX_LINK characters, and no part has another: always within both bounds)
    if (Array.isArray(f.spans)) out.spans = f.spans.map(function(sp) {
        var o = {}, j;
        for (j in sp) if (own(sp, j) && !(j === 'size' && !R.size) && !(j === 'link' && !room(sp.link))) o[j] = sp[j];
        return o;
    });
    return cleanFmt(out, text);   // parts that now add nothing are dropped, neighbours of one look merged
}
function build(fmt, font, text, R) {
    var f = fieldLook(fmt, text, R), fo = R.font ? fontKnown(font) : '';
    if (!f && !fo) return undefined;
    var rec = {};
    if (f) rec.fmt = f;
    if (fo) rec.font = fo;
    rec.sig = textSig(text);
    return rec;
}
function textOk(text, R) { return typeof text === 'string' && text.length <= SIG_MAX && !(R.max > 0 && text.length > R.max); }
function cleanRec(rec, text, rule) {
    var R = ruleOf(rule);
    if (!textOk(text, R) || !recShapeOk(rec) || rec.sig !== textSig(text)) return undefined;   // the one stale rule: a look made for other words is no look
    return build(own(rec, 'fmt') ? rec.fmt : undefined, own(rec, 'font') ? rec.font : undefined, text, R);
}
function makeRec(fmt, font, text, rule) {
    var R = ruleOf(rule);
    return textOk(text, R) ? build(fmt, font, text, R) : undefined;
}
function lookWeight(rec) {
    if (!plain(rec)) return 0;
    var w = 16, len = function(o) { var t = 0, k; for (k in o) if (own(o, k) && typeof o[k] === 'string') t += o[k].length; return t; };
    if (typeof rec.font === 'string') w += rec.font.length;
    if (plain(rec.fmt)) { w += len(rec.fmt); if (Array.isArray(rec.fmt.spans)) rec.fmt.spans.forEach(function(sp) { w += 48 + (plain(sp) ? len(sp) : 0); }); }
    return w;
}
// [textcheck:lookcore-end]

var API = { RULES: RULES, LINKS: LINKS, LINK_CHARS: LINK_CHARS, textSig: textSig, lookShapeOk: lookShapeOk, recShapeOk: recShapeOk, fieldLook: fieldLook, cleanRec: cleanRec, makeRec: makeRec, lookWeight: lookWeight };
if (typeof window !== 'undefined') window.wpLook = API;
export { RULES, LINKS, LINK_CHARS, textSig, lookShapeOk, recShapeOk, fieldLook, cleanRec, makeRec, lookWeight };

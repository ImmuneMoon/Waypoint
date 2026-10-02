/* Handbook pages: the sanitizer, the wire cleaner, the renderer and the flowchart compiler (1.5.0).
   A pure module — no DOM, no state, and only two imports, both pure leaves (textfmt.js: the format of a
   plain field; safecore.js: a colour that is a colour) — so net.js can clean a page for the wire, the
   GM's preview, the player's reader and the HTML export can render one through the same code, and
   tools/doccheck.js can run the whole thing under Node. Published as window.wpDocRender when a
   window exists (the same guard formula.js uses).

   The contract every caller relies on:
     sanitizeHtml(html)      the ONLY way rich-text content reaches a screen. Allow-list of tags,
                             two attributes (href on a, http(s) only; style on span, REBUILT from a parsed
                             colour and a size step, never passed through), text re-escaped, output
                             re-serialised from a token list (never a slice of the input) and balanced.
     fmtHtml(text, fmt, put) a plain field with a format (textfmt.js) as markup: each run's text through put
                             (esc on a page) inside a span whose style is built from the cleaned values only — a
                             colour, fixed words for weight, slant, underline and strike, a fixed step for its size —
                             and a run with a link inside an <a href> written exactly as the sanitiser writes one;
                             with no format, exactly put(text).
     fmtRich(text, fmt)      the same for a field that reads typed markup (a planner's): the whole field through
                             sanitizeHtml once, the runs laid over its text; with no format, exactly sanitizeHtml(text).
     sanitizeBare(html)      sanitizeHtml less the look: a span or a font is just its text.
     cleanBlockFmts(block)   every format a planner or page block carries, cleaned in place against its text — and a
                             flowchart node's link (diagramLink).
     labelFmt(fmt, text)     a flowchart label's format: the cleaner's, less every link (a label never carries one).
     cleanDoc(doc, opts)     the wire sanitizer (host) and the client-side normaliser (keepHidden):
                             a new object with only the known fields, every string capped, every
                             number validated; null for a GM-only page unless opts.keepHidden.
     renderDoc(doc, opts)    the page as HTML built from escaped text and sanitized content only.
     proseHtml(content, t)   the planner's line-break rule, shared so pages and planners read alike.
     compileFlowchart(b)     the builder block → mermaid source (moved here from planner.js).
     diagramLink(v)          the one rule for a diagram's link: a web address the link rule keeps (textfmt.js cleanLink)
                             that the diagram library reads back exactly as written; '' for anything else.
     linkLine(id, link)      the ONE line a diagram's link reaches the diagram library in — click <id> href "<address>" —
                             or '' (an id or an address the rule refuses); readLinkLine(line) reads exactly that line back.
   Sizes: LIMITS below. Block ids: every block carries one ('b_…'); cleanDoc re-mints duplicates. */
'use strict';
import { cleanFmt, cleanLink, runsOf, SIZE_EM } from './textfmt.js';
import { cssColor } from './safecore.js';

var VERSION = '1.5.0';
var LIMITS = { html: 65536, title: 300, cell: 2000, caption: 500, blocks: 500, bytes: 2 * 1024 * 1024, cols: 8, rows: 500, nodes: 200, edges: 400 };

var DOC_BLOCKS = ['h1', 'h2', 'h3', 'text', 'lede', 'oneline', 'callout', 'flare', 'image', 'table', 'rule', 'diagram', 'flowchart'];
var PROSE = { text: 1, lede: 1, oneline: 1, callout: 1, flare: 1 };

/* ---------- text escaping ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '\u00a9', reg: '\u00ae', hellip: '\u2026', mdash: '\u2014', ndash: '\u2013', lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d', bull: '\u2022', middot: '\u00b7', deg: '\u00b0', times: '\u00d7', divide: '\u00f7', plusmn: '\u00b1', frac12: '\u00bd', frac14: '\u00bc', frac34: '\u00be', larr: '\u2190', rarr: '\u2192', uarr: '\u2191', darr: '\u2193', harr: '\u2194', laquo: '\u00ab', raquo: '\u00bb', sect: '\u00a7', para: '\u00b6', dagger: '\u2020', Dagger: '\u2021', trade: '\u2122', euro: '\u20ac', pound: '\u00a3', yen: '\u00a5', cent: '\u00a2', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', shy: '' };
// Entity decoding for text nodes and attribute values. Numeric forms cover every code point; the
// named table covers what the RTE and the symbol tray can produce (an unknown name stays literal).
function decodeEntities(s) {
    return String(s).replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,15});/gi, function(m, body) {
        if (body.charAt(0) === '#') {
            var cp = body.charAt(1).toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
            if (!isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '\ufffd';
            try { return String.fromCodePoint(cp); } catch (e) { return '\ufffd'; }
        }
        return Object.prototype.hasOwnProperty.call(ENT, body) ? ENT[body] : m;
    });
}

/* ---------- the sanitizer ----------
   A tokenizer, not a parser: the input is cut at LIMITS.html, split into tags and text, and then
   the output is written from scratch — allowed tags by name only, text re-escaped, one attribute
   (href on a) rebuilt from its decoded value when it is an http(s) URL, and a span's style written
   anew from the one colour and the one size step read out of it. Nothing from a tag token
   is ever copied through, which is what makes <scr<script>ipt>, <!-->, unclosed quotes and tags
   inside <code> inert: they are either a recognised tag (emitted clean) or text (escaped). Tags are
   balanced on output with a stack: stray closers are dropped, open tags are closed at the end. */
var ALLOWED = { p: 1, br: 1, b: 1, strong: 1, i: 1, em: 1, u: 1, s: 1, strike: 1, ul: 1, ol: 1, li: 1, code: 1, pre: 1, a: 1 };
var VOID = { br: 1 };
var DROP_CONTENT = { script: 1, style: 1, template: 1, iframe: 1, object: 1, embed: 1, svg: 1, math: 1, noscript: 1, textarea: 1, select: 1, option: 1, button: 1, input: 1, form: 1, frame: 1, frameset: 1, title: 1, head: 1 };
var AS_P = { div: 1, blockquote: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, section: 1, article: 1 };   // block containers the RTE or a paste can produce: paragraphs, so line breaks survive
var LIST = { ul: 1, ol: 1 };
// A text block's colour and size (1.5.0): <span style="color:#rrggbb;font-size:<step>"> is the ONE form that is ever written, and it is
// written from the parsed values. What an editing command leaves behind — <font color>, a span whose colour reads rgb(r, g, b) — is read
// into that form; every other property, every other attribute and a value that is neither are dropped; a span left with nothing is
// just its text. A size step is a share of its parent's size, so a sized span inside a sized span keeps only its colour.
var SIZE_CSS = {}; Object.keys(SIZE_EM).forEach(function(k) { SIZE_CSS[SIZE_EM[k]] = 1; });
function cssHex(v) {
    v = String(v).trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(v)) return v;
    var m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(v);
    if (!m || +m[1] > 255 || +m[2] > 255 || +m[3] > 255) return '';
    return '#' + [m[1], m[2], m[3]].map(function(n) { return (+n < 16 ? '0' : '') + (+n).toString(16); }).join('');
}
function spanLook(t) {
    var color = '', size = '';
    if (t.tag === 'font') { var fc = attrValue(t.attrs, 'color'); if (fc != null && fc.length <= 40) color = cssHex(decodeEntities(fc)); }
    var st = attrValue(t.attrs, 'style');
    if (st != null && st.length <= 200) decodeEntities(st).split(';').forEach(function(d) {
        var at = d.indexOf(':'); if (at < 0) return;
        var prop = d.slice(0, at).trim().toLowerCase(), val = d.slice(at + 1).trim().toLowerCase();
        if (prop === 'color') { var c = cssHex(val); if (c) color = c; }
        else if (prop === 'font-size' && Object.prototype.hasOwnProperty.call(SIZE_CSS, val)) size = val;
    });
    return { color: color, size: size };
}
// On the stack a span is 'span' (a colour), 'span+' (a size, with or without a colour) or '#span' (nothing kept: no tag was written)
function isSpan(n) { return n === 'span' || n === 'span+' || n === '#span'; }
function shut(n) { return n === '#span' ? '' : '</' + (n === 'span+' ? 'span' : n) + '>'; }

function tokenize(html) {
    var out = [], i = 0, n = html.length;
    while (i < n) {
        var lt = html.indexOf('<', i);
        if (lt < 0) { out.push({ text: html.slice(i), at: i }); break; }
        if (lt > i) out.push({ text: html.slice(i, lt), at: i });   // at: where the text began in the input (fmtRich lays a field's runs over it)
        // comment / CDATA / processing instruction / doctype: dropped whole
        if (html.charAt(lt + 1) === '!' || html.charAt(lt + 1) === '?') {
            var endC;
            if (html.slice(lt, lt + 4) === '<!--') { endC = html.indexOf('-->', lt + 4); endC = endC < 0 ? n : endC + 3; }
            else { endC = html.indexOf('>', lt); endC = endC < 0 ? n : endC + 1; }
            i = endC; continue;
        }
        // a tag: name, then attributes (quotes respected: an unclosed quote runs to the end of the input)
        var m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, lt + 40));
        if (!m) { out.push({ text: '<', at: lt }); i = lt + 1; continue; }
        var j = lt + m[0].length, q = null, attrs = '';
        while (j < n) {
            var ch = html.charAt(j);
            if (q) { if (ch === q) q = null; }
            else if (ch === '"' || ch === "'") q = ch;
            else if (ch === '>') break;
            j++;
        }
        attrs = html.slice(lt + m[0].length, j);
        out.push({ tag: m[2].toLowerCase(), close: m[1] === '/', attrs: attrs, self: /\/\s*$/.test(attrs) });
        i = j < n ? j + 1 : n;
    }
    return out;
}
function attrValue(attrs, name) {
    var re = new RegExp('(?:^|[\\s"\'])' + name + '\\s*=\\s*("([^"]*)"?|\'([^\']*)\'?|([^\\s"\'>]+))', 'i'), m = re.exec(attrs);
    if (!m) return null;
    return m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] || '';
}
// A link target survives only as a plain http(s) URL: entity-decoded first (so &#106;avascript: cannot
// hide), trimmed, and refused outright when any control character or inner whitespace remains.
function safeHref(v) {
    if (v == null) return null;
    v = decodeEntities(v).trim();
    if (/[\u0000-\u001f\u007f\s]/.test(v) || v.length > 2000) return null;
    return /^https?:\/\/.+/i.test(v) ? v : null;
}
// What every link is written with — a text block's typed one and a styled field's (fmtHtml, fmtRich) alike
function aAttrs(href) { return ' href="' + esc(href) + '" target="_blank" rel="noopener noreferrer"'; }
// A format's link (textfmt.js cleanLink keeps the same addresses: tools/textcheck.js runs both rules on one corpus) through the sanitiser's
// own rule once more, read exactly as it would be read back from the href it is about to be written in. '' when it is no link.
function runHref(link) { return (typeof link === 'string' && link && safeHref(esc(link))) || ''; }
// One sanitiser. opt is this module's own, never a caller's (sanitizeHtml takes one argument): cut(text, at) gives a text token as pieces
// [[text, css, href], …] — fmtRich's runs, each css written by runCss from cleaned values, each href one runHref passed — and a piece that
// has a css sits in a span of its own, one that has a link in an <a> of its own (around its span; the same link runs on across pieces),
// both closed before any tag is written, so a run never crosses the field's own markup, and never opened inside a link the field's own
// markup has open (links never nest: the typed one stands); sized: the field has a size, so no span in it keeps one; bare: a span or a
// font carries nothing. With no opt every byte is what it always was.
function sanitize(html, opt) {
    var s = String(html == null ? '' : html);
    if (s.length > LIMITS.html) s = s.slice(0, LIMITS.html);
    var toks = tokenize(s), out = '', stack = [], skip = null, skipDepth = 0, runCssOpen = '', runHrefOpen = '';
    function runShut(a) { if (runCssOpen) { out += '</span>'; runCssOpen = ''; } if (a && runHrefOpen) { out += '</a>'; runHrefOpen = ''; } }
    function mark(x) { if (!x) return; runShut(true); out += x; }   // markup: the open run's span (and its link) ends first
    function openTag(name, extra) { stack.push(name); mark('<' + name + (extra || '') + '>'); }
    function closeTo(name) {   // close everything above the nearest open `name`; drop the closer when it is not open
        var at = stack.lastIndexOf(name); if (at < 0) return;
        while (stack.length > at) mark(shut(stack.pop()));
    }
    function closeSpan() { var at = stack.length - 1; while (at >= 0 && !isSpan(stack[at])) at--; if (at < 0) return; while (stack.length > at) mark(shut(stack.pop())); }
    function inList() { return stack.some(function(t) { return LIST[t]; }); }
    function piece(p) {
        var href = p[2] && stack.indexOf('a') < 0 ? p[2] : '';
        if (href !== runHrefOpen) { runShut(true); runHrefOpen = href; if (href) out += '<a' + aAttrs(href) + '>'; }
        if (p[1] !== runCssOpen) { runShut(false); runCssOpen = p[1]; if (runCssOpen) out += '<span style="' + runCssOpen + '">'; }
        out += esc(decodeEntities(p[0]));
    }
    for (var k = 0; k < toks.length; k++) {
        var t = toks[k];
        if (skip) {   // inside a dropped-content element: swallow until its closer
            if (t.tag === skip) { if (t.close) { if (--skipDepth <= 0) { skip = null; skipDepth = 0; } } else if (!t.self) skipDepth++; }
            continue;
        }
        if (t.text !== undefined) { if (opt && opt.cut) opt.cut(t.text, t.at).forEach(piece); else out += esc(decodeEntities(t.text)); continue; }
        var name = t.tag;
        if (DROP_CONTENT[name]) { if (!t.close && !t.self) { skip = name; skipDepth = 1; } continue; }
        if (AS_P[name]) name = 'p';
        if (name === 'span' || name === 'font') {
            if (t.close) { closeSpan(); continue; }
            if (t.self) continue;
            var look = opt && opt.bare ? { color: '', size: '' } : spanLook(t);
            if (look.size && (stack.indexOf('span+') >= 0 || (opt && opt.sized))) look.size = '';   // sizes never nest: the outer one stands
            if (!look.color && !look.size) { stack.push('#span'); continue; }   // nothing kept: just its text (its closer is still its own)
            stack.push(look.size ? 'span+' : 'span');
            mark('<span style="' + (look.color ? 'color:' + look.color : '') + (look.color && look.size ? ';' : '') + (look.size ? 'font-size:' + look.size : '') + '">');
            continue;
        }
        if (!ALLOWED[name]) continue;                       // unknown tag: dropped, its text kept (img, table cells…)
        if (t.close) { if (!VOID[name]) closeTo(name); continue; }
        if (VOID[name]) { mark('<br>'); continue; }
        if (name === 'li' && !inList()) name = 'p';         // a list item outside a list reads as a paragraph
        if (name === 'p' && stack.indexOf('p') >= 0) closeTo('p');   // paragraphs never nest (the browser would not either)
        if (name === 'a') {
            var href = safeHref(attrValue(t.attrs, 'href'));
            if (!href) continue;                            // a link without a safe target is just its text
            if (stack.indexOf('a') >= 0) closeTo('a');
            openTag('a', aAttrs(href));
            continue;
        }
        openTag(name);
        if (t.self) closeTo(name);
    }
    while (stack.length) mark(shut(stack.pop()));
    runShut(true);
    return out;
}
function sanitizeHtml(html) { return sanitize(html, null); }
// The same, less the look: a span or a font is just its text (a published call; a Markdown import keeps the look — docmd.js carries colour
// and size both ways).
function sanitizeBare(html) { return sanitize(html, { bare: true }); }

/* ---------- a plain field with a format: drawn from runs (textfmt.js) ----------
   A title, a table cell, a caption is plain text with its styling stored beside it. Drawn here: the format is cleaned
   against the text first (a hostile one draws plain), each run's text goes through `put` (esc on a page; the planner's
   preview hands in sanitizeHtml, as it reads its fields), and a run that has a look sits in a span whose style is
   written from the cleaned values only: a colour through safecore's cssColor, fixed words for weight, slant, underline,
   strike and size. A size is never inside a size: a field of one size has one span around everything (as it always had), and
   where its parts differ each run carries its own. A run with a link sits in an <a> written as the sanitiser writes a text
   block's (aAttrs), its address through the sanitiser's own rule once more (runHref); neighbours of one link share the <a>.
   With no format the result is exactly put(text): nothing on a page changes until a field is styled. */
function own(o, k) { return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }
// sized: the field's one size is written around everything, so no run writes its own
function runCss(r, sized) {
    var c = cssColor(r.color), css = '';
    if (c && /^#[0-9a-f]{6}$/.test(c)) css += 'color:' + c + ';';
    if (r.b === true) css += 'font-weight:bold;';
    if (r.i === true) css += 'font-style:italic;';
    if (r.u === true || r.st === true) css += 'text-decoration:' + (r.u === true ? 'underline' : '') + (r.u === true && r.st === true ? ' ' : '') + (r.st === true ? 'line-through' : '') + ';';
    if (!sized && own(SIZE_EM, r.size)) css += 'font-size:' + SIZE_EM[r.size] + ';';
    return css;
}
function fmtHtml(text, fmt, put) {
    var t = text == null ? '' : String(text), inner = typeof put === 'function' ? put : esc;
    var f = t ? cleanFmt(fmt, t) : undefined;
    if (!f) return inner(t);
    var size = f.size && own(SIZE_EM, f.size) ? SIZE_EM[f.size] : '', out = '', open = '';
    runsOf(t, f).forEach(function(r) {
        var css = runCss(r, !!size), href = runHref(r.link);
        if (href !== open) { if (open) out += '</a>'; if (href) out += '<a' + aAttrs(href) + '>'; open = href; }
        out += css ? '<span style="' + css + '">' + inner(r.t) + '</span>' : inner(r.t);
    });
    if (open) out += '</a>';
    return size ? '<span style="font-size:' + size + ';">' + out + '</span>' : out;
}
// A field that reads typed markup — a planner's titles, node fields and cells, which have always gone through the page sanitiser, so a typed
// <b>, <br> or &mdash; reads as markup. The WHOLE field is sanitised once, exactly as it is with no format, and the format's runs are laid
// over its text by their offsets in what was typed: a run that begins or ends inside the typed markup changes nothing about how that markup
// reads (the bold stays bold, the dash a dash — an entity is one character and takes the look of the run it begins in), and a tag is never
// made of two runs. A field with a size — its own, or one on any part — keeps no size of a typed span inside it (a size is a share of its
// parent's: they would multiply). A run's link is not written inside a link the typed markup has open (the typed one stands).
var ENTITY = /&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,15});/gi;   // what decodeEntities reads as one character
function fmtRich(text, fmt) {
    var t = text == null ? '' : String(text), f = t ? cleanFmt(fmt, t) : undefined;
    if (!f) return sanitizeHtml(t);
    var size = f.size && own(SIZE_EM, f.size) ? SIZE_EM[f.size] : '', anySize = !!size;
    var at = 0, runs = runsOf(t, f).map(function(r) { var o = { e: at + r.t.length, css: runCss(r, !!size), href: runHref(r.link) }; at = o.e; if (r.size) anySize = true; return o; });
    var out = sanitize(t, { sized: anySize, cut: function(tx, off) {
        var pieces = [], i = off, end = off + tx.length, ents = [], m;
        ENTITY.lastIndex = 0;
        while ((m = ENTITY.exec(tx))) ents.push([off + m.index, off + m.index + m[0].length]);
        for (var k = 0; k < runs.length && i < end; k++) {
            var z = Math.min(runs[k].e, end);
            for (var j = 0; j < ents.length; j++) if (z > ents[j][0] && z < ents[j][1]) z = ents[j][1];
            if (z > i) { pieces.push([tx.slice(i - off, z - off), runs[k].css, runs[k].href]); i = z; }
        }
        if (i < end) pieces.push([tx.slice(i - off), '', '']);   // past the last run (a text longer than the sanitiser reads is cut there)
        return pieces;
    } });
    return size ? '<span style="font-size:' + size + ';">' + out + '</span>' : out;
}
// Where a block keeps the format of each of its plain fields (beside the value, so moving a row or a node moves its look with it):
// block.fmt.{title, sub, tag, must, caption}; a table's heads in colFmt, a list parallel to cols; a row's cells on the row
// (row.fmt.col1…) — or, for a page as a player holds it (rows are lists there), in rowFmt, a list of lists parallel to rows;
// a flowchart node's label on the node, an arrow's on the arrow.
var FMT_KEYS = ['title', 'sub', 'tag', 'must', 'caption'];
// A flowchart label's format: the cleaner's, less every link. A diagram's labels never carry a web address (the label rules forbid href,
// so one would never be drawn): none is kept from a file or a host, sent, or written into a Markdown file.
function labelFmt(fmt, text) {
    var f = cleanFmt(fmt, text);
    if (!f || !(f.link || (f.spans || []).some(function(sp) { return !!sp.link; }))) return f;
    delete f.link;
    (f.spans || []).forEach(function(sp) { delete sp.link; });
    return cleanFmt(f, text);
}
function fieldFmt(b, k) { return own(b, 'fmt') && own(b.fmt, k) ? b.fmt[k] : undefined; }
function colFmtOf(b, ci) { return Array.isArray(b.colFmt) ? b.colFmt[ci] : undefined; }
function cellFmtOf(b, ri, ci) {
    var r = Array.isArray(b.rows) ? b.rows[ri] : null;
    if (r && typeof r === 'object' && !Array.isArray(r)) return own(r, 'fmt') && own(r.fmt, 'col' + (ci + 1)) ? r.fmt['col' + (ci + 1)] : undefined;
    var rf = Array.isArray(b.rowFmt) ? b.rowFmt[ri] : null;
    return Array.isArray(rf) ? rf[ci] : undefined;
}
function strOf(v) { return typeof v === 'string' ? v : ''; }
// a list of formats parallel to a list of texts: null where there is none, no trailing nulls, undefined when all are
function fmtList(texts, fmtAt) {
    var out = [], last = -1;
    for (var i = 0; i < texts.length; i++) { var f = cleanFmt(fmtAt(i), strOf(texts[i])); out.push(f || null); if (f) last = i; }
    return last < 0 ? undefined : out.slice(0, last + 1);
}
// Every format a block carries, cleaned in place against the text it belongs to (a planner from a file; a load). A format whose text
// is not there, a key the app does not use and an empty holder all go.
function cleanBlockFmts(b) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return b;
    if (b.fmt !== undefined) {
        var m = {}, any = false;
        FMT_KEYS.forEach(function(k) { var f = cleanFmt(fieldFmt(b, k), strOf(b[k])); if (f) { m[k] = f; any = true; } });
        if (any) b.fmt = m; else delete b.fmt;
    }
    if (b.colFmt !== undefined) {
        var cf = Array.isArray(b.cols) ? fmtList(b.cols.slice(0, LIMITS.cols), function(i) { return colFmtOf(b, i); }) : undefined;
        if (cf) b.colFmt = cf; else delete b.colFmt;
    }
    var rowsAreLists = false;
    if (Array.isArray(b.rows)) b.rows.forEach(function(r) {
        if (Array.isArray(r)) { rowsAreLists = true; return; }
        if (!r || typeof r !== 'object' || r.fmt === undefined) return;
        var rm = {}, rAny = false;
        if (own(r, 'fmt') && r.fmt && typeof r.fmt === 'object' && !Array.isArray(r.fmt)) Object.keys(r.fmt).forEach(function(k) {
            var km = /^col([1-9][0-9]?)$/.exec(k); if (!km || +km[1] > LIMITS.cols) return;
            var f = cleanFmt(r.fmt[k], strOf(own(r, k) ? r[k] : '')); if (f) { rm[k] = f; rAny = true; }
        });
        if (rAny) r.fmt = rm; else delete r.fmt;
    });
    if (b.rowFmt !== undefined) {
        var rfOut = null;
        if (rowsAreLists && Array.isArray(b.rowFmt)) {
            var lastR = -1, list = b.rows.slice(0, LIMITS.rows).map(function(r, ri) { var one = Array.isArray(r) ? fmtList(r.slice(0, LIMITS.cols), function(ci) { return cellFmtOf(b, ri, ci); }) : undefined; if (one) lastR = ri; return one || null; });
            if (lastR >= 0) rfOut = list.slice(0, lastR + 1);
        }
        if (rfOut) b.rowFmt = rfOut; else delete b.rowFmt;
    }
    ['nodes', 'edges'].forEach(function(key) {
        if (Array.isArray(b[key])) b[key].forEach(function(n) {
            if (!n || typeof n !== 'object') return;
            if (n.link !== undefined) { var lk = key === 'nodes' && own(n, 'link') ? diagramLink(n.link) : ''; if (lk) n.link = lk; else delete n.link; }   // a node's link by the one rule; an arrow carries none
            if (n.fmt === undefined) return;
            var f = labelFmt(own(n, 'fmt') ? n.fmt : undefined, strOf(n.text)); if (f) n.fmt = f; else delete n.fmt;
        });
    });
    return b;
}

/* ---------- prose: the planner's line-break rule, shared ---------- */
// Typed text keeps its line breaks: a blank line starts a new paragraph, a single Enter a line
// break. Content that already uses block HTML (<p>, <br>, lists…) is left as is. (planner.js nl())
function nl(content, para) {
    var c = String(content || '');
    if (!/\n/.test(c) || /<(p|br|div|ul|ol|li|h[1-6]|table|pre|blockquote)\b/i.test(c)) return c;
    c = c.replace(/\r/g, '');
    if (para) return c.split(/\n{2,}/).map(function(x) { return x.replace(/\n/g, '<br>'); }).join('</p><p>');
    return c.replace(/\n/g, '<br>');
}
// The 'text' block wraps in <p> unless the content is already block HTML; the other prose blocks
// keep line breaks only. Sanitized on the way out, so a planner preview and a page read the same.
function proseHtml(content, type) {
    var c = String(content || '');
    var body = type === 'text'
        ? (/<(p|div|ul|ol|h[1-6]|blockquote|pre|table)\b/i.test(c) ? c : '<p>' + nl(c, true) + '</p>')
        : nl(c);
    return sanitizeHtml(body);
}

/* ---------- the flowchart compiler (from planner.js) ---------- */
// Mermaid reads ( ) [ ] { } | as shape and edge markers, so free text goes inside quotes; inside
// quotes only " and # need escaping (mermaid's #quot; / #35; entities).
function mmEsc(t) { return String(t || '').replace(/#/g, '#35;').replace(/"/g, '#quot;').replace(/\r?\n/g, '<br>'); }
function mmText(t) { return '"' + mmEsc(t) + '"'; }
// A label with a format (textfmt.js): each run inside the plain tags mermaid's own label cleaner keeps (bootdiagram.js: no style attribute,
// no class of ours needed) — <b>, <i>, <u>, <s>, <font color=rrggbb> (no quote and no # may stand in a mermaid string: a colour without
// its # reads as the same colour) and <big> / <small> for the size steps (a browser's own 1.2 step, the steps' ratio): around everything
// where the label has one size, around a run where its parts differ — never one inside another. No link: the label rules forbid href,
// and a label's format holds none (labelFmt). Mermaid measures the label as it will be drawn, so the box fits it; inline tags add no
// line break a plain label would not have. Built from the cleaned values only; a label with no format compiles exactly as before.
var MM_SIZE = { small: ['<small>', '</small>'], large: ['<big>', '</big>'], larger: ['<big><big>', '</big></big>'], huge: ['<big><big><big>', '</big></big></big>'] };
function mmLabel(text, fmt) {
    var t = String(text || ''), f = labelFmt(fmt, t);
    if (!f) return mmText(t);
    var sz = f.size && own(MM_SIZE, f.size) ? MM_SIZE[f.size] : null;
    var body = runsOf(t, f).map(function(r) {
        var x = mmEsc(r.t), c = cssColor(r.color), rz = !sz && own(MM_SIZE, r.size) ? MM_SIZE[r.size] : null;
        if (r.i === true) x = '<i>' + x + '</i>';
        if (r.b === true) x = '<b>' + x + '</b>';
        if (r.u === true) x = '<u>' + x + '</u>';
        if (r.st === true) x = '<s>' + x + '</s>';
        if (c && /^#[0-9a-f]{6}$/.test(c)) x = '<font color=' + c.slice(1) + '>' + x + '</font>';
        return rz ? rz[0] + x + rz[1] : x;
    }).join('');
    return '"' + (sz ? sz[0] + body + sz[1] : body) + '"';
}
function mmId(t) { var v = String(t || '').trim().replace(/[^A-Za-z0-9_]/g, '_'); return v === '__proto__' ? '_proto_' : v || 'n'; }   // (a diagram's names: see mmKey)
function compileFlowchart(b) {
    var spc = { compact: [18, 28], normal: [50, 50], wide: [90, 90] }[b.space || 'normal'] || [50, 50];
    var m = '%%{init: {"flowchart": {"nodeSpacing": ' + spc[0] + ', "rankSpacing": ' + spc[1] + ', "htmlLabels": true}}}%%\n';
    m += 'flowchart ' + (/^(TD|LR|BT|RL)$/.test(b.dir || '') ? b.dir : 'TD') + '\n';
    m += 'classDef gold fill:#302517,stroke:#e0a54f,color:#fff\n';
    m += 'classDef blue fill:#1a272e,stroke:#4db3d3,color:#fff\n';
    m += 'classDef green fill:#1a3022,stroke:#5cb87a,color:#fff\n';
    m += 'classDef red fill:#361f1e,stroke:#d9534f,color:#fff\n';
    m += 'classDef violet fill:#281f3b,stroke:#b98cff,color:#fff\n';
    m += 'classDef neutral fill:#26262a,stroke:#c9c9d4,color:#fff\n';
    var links = [];   // a linked node's line (linkLine): the whole node is the link — written after everything else, so a chart with none compiles exactly as before
    (Array.isArray(b.nodes) ? b.nodes : []).forEach(function(n) {
        if (!n || typeof n !== 'object') return;
        var id = mmId(n.id || ('n' + Math.random().toString(36).substr(2, 5)));
        var ll = Object.prototype.hasOwnProperty.call(n, 'link') ? linkLine(id, n.link) : ''; if (ll) links.push(ll);
        var txt = mmLabel(n.text || 'Node', Object.prototype.hasOwnProperty.call(n, 'fmt') ? n.fmt : undefined);
        var s1 = '[', s2 = ']';
        if (n.shape === 'rounded') { s1 = '('; s2 = ')'; }
        else if (n.shape === 'pill') { s1 = '(['; s2 = '])'; }
        else if (n.shape === 'diamond') { s1 = '{'; s2 = '}'; }
        else if (n.shape === 'hex') { s1 = '{{'; s2 = '}}'; }
        m += id + s1 + txt + s2 + ':::' + (/^(gold|blue|green|red|violet|neutral)$/.test(n.color || '') ? n.color : 'neutral') + '\n';
    });
    (Array.isArray(b.edges) ? b.edges : []).forEach(function(e) {
        if (!e || typeof e !== 'object' || !e.from || !e.to) return;
        var line = e.style === 'dotted' ? '-.->' : '-->';
        if (e.text) line += '|' + mmLabel(e.text, Object.prototype.hasOwnProperty.call(e, 'fmt') ? e.fmt : undefined) + '|';
        m += mmId(e.from) + ' ' + line + ' ' + mmId(e.to) + '\n';
    });
    links.forEach(function(l) { m += l + '\n'; });
    return m;
}
// A DIAGRAM'S LINK — one rule. A diagram link is a web address the link rule keeps (textfmt.js cleanLink), attached to a shape by its
// id, and it reaches the diagram library in ONE form only, a line this file writes itself:
//     click <id> href "<address>"
// Nothing else about a click is ever kept: no function call, no callback, no tooltip, no target. The library runs in its strict mode
// for everyone (bootdiagram.js), where an action that calls a function does nothing, and a click on the drawn link is judged like any
// other link's (linkgate.js: your own opens, one from someone else asks first).
//   <address>  cleanLink's output, less what the library would not read back exactly as it is written — it reads a few sequences of
//              its own inside any text: a " ends the string; < and > (it rewrites tags); %% (its comments and its %%{…}%% blocks);
//              &# and &newline; / &tab; (it decodes them in an address); a ; after a # (its #…; codes, and a ; it takes off such a
//              line); the characters U+0080 to U+009F and U+200B to U+200D (it drops them); and its own two placeholders. An address
//              that holds one of those is no diagram link (diagramLink gives '').
//   <id>       1 to 64 letters, digits, _ or -, and never a name every object carries (constructor, __proto__, toString …): the
//              library keeps its shapes in a plain object keyed by id. (The library itself takes any run of characters with no space
//              in it, and a list a,b: neither is taken here.)
var MM_LINK_NO = /["<>\u0080-\u009f\u200b-\u200d]|%%|&#|&(?:newline|tab);|#.*;|\ufb02\u00b0|\u00b6\u00df/i;
function diagramLink(v) { var l = cleanLink(v); return l && !MM_LINK_NO.test(l) ? l : ''; }
function linkId(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id) && !(id in Object.prototype) ? id : ''; }
function linkLine(id, link) { var i = linkId(id), l = diagramLink(link); return i && l ? 'click ' + i + ' href "' + l + '"' : ''; }
// the line read back: { id, link } — or null for anything that is not exactly the line linkLine writes
function readLinkLine(line) { var m = /^click ([A-Za-z0-9_-]{1,64}) href "([^"]*)"$/.exec(String(line)); return m && linkLine(m[1], m[2]) === m[0] ? { id: m[1], link: m[2] } : null; }

// Mermaid's link and callback directives never depend on its security mode: none reaches the library as it was written. Applied to
// diagram sources (cleanDoc) and again when rendering (renderDoc).
// A directive is a statement that begins with one of the library's words, and a statement ends at a line break or at a ';' (the
// library reads both alike): a line that begins with one goes whole, and a line that holds one further on is cut there —
// a directive's own text may hold a ';', so nothing after it is kept. The ';' that closes one of the library's own #…; entities
// is part of the entity, as the library reads it. The rule fails closed: a ';' inside a hand-written label counts too, so a label
// that says "…; click …" loses that part (the entity #59; writes a ';' that is the label's own).
// A statement also begins, with nothing before it, after a '}' (the end of an accDescr { … } block, on its own line or the block's
// first) and after the library's statements that need no separator after them, however many stand in a row (MM_NOSEP): a flowchart's
// end, a Gantt chart's gantt, inclusiveEndDates, topAxis, weekday <day> and a date. A directive there is judged as one at the start
// of a line — the line is cut where it begins, the statements before it stay. That too fails closed: a '}' inside a label counts.
//   click / callback / href / linkStyle …   any diagram's
//   link <name> "address"                   a class diagram's (a node, a class or a task that is merely called link is left alone)
//   link / links <actor>: …                 a sequence diagram's, judged only in a source that names one
// ONE kind of directive is written back instead of removed: a link statement of a flowchart or of a class diagram, as the library
// itself reads it (its words in lower case, an id by the rule above, an address the rule above keeps), becomes the canonical line —
// a line of its own, in the directive's place:
//   flowchart / graph    click <id> href "<address>" …     and     click <id> "<address>" …
//   classDiagram         click <Class> href "<address>" …  and     link <Class> "<address>" …
// Whatever follows the address on that line (a tooltip, a target, anything else) is dropped. Every other directive — a callback,
// call, a link that is not one of those forms, a sequence diagram's menus, a link statement in any other kind of diagram — is removed
// exactly as before. The kind of diagram is told as the library tells it (mmKind): after its %%{…}%% blocks and its comment lines the
// source begins with flowchart, graph or classDiagram; a source that begins with front matter, or holds a block inside a block, has
// no kind and keeps no link. (In a Gantt chart the library would steer the app's own window to a link's address: no link is ever
// written for one — and linkgate.js refuses any script's window.open that would load an address into the window it is made from.)
// The source is judged as the library will read it: a NUL (which a page drops) is taken out, a lone carriage return (which a page
// reads as a line break) is a line break, and the library's own %%{…}%% blocks — which it takes out before it reads a diagram,
// wherever they stand — are taken out with its own pattern and what is left is judged again; a source that hides a directive that
// way — a link too: the canonical line is always one this strip wrote, never one the library would put together — is handed over
// without its blocks. Any other source is returned as it always was.
// compiled (exactly true): the app's own compiled flowchart (compileFlowchart). Every label there is one quoted string, so a ';'
// in it is the label's own: only whole lines are judged, and of the lines that begin with a directive only one that is exactly the
// canonical line stays.
// A link the library still draws (another kind of diagram's own way of writing one) is an <a> in the drawing, and a click on it is
// judged like any other link's (linkgate.js).
var MM_DIRECTIVE = /\s*(?:click|callback|href|linkStyle)\b/iy;
var MM_LINK = /\s*link\s+(?![-=.<>~&|:\s"'])[^"'\n;]*["']/iy;
var MM_SEQ_LINK = /\s*links?\s+[^:;\n]*:/iy;
var MM_NOSEP = /(?:\s*(?:end|gantt|inclusiveEndDates|topAxis|weekday\s+\w+|\d{4}-\d\d-\d\d)\b)+/iy;   // the statements that need no separator after them
var MM_BLOCK = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;   // the library's own pattern for its %%{…}%% blocks
var MM_COMMENT = /^\s*%%(?!{)[^\n]+\n?/gm;   // the library's own pattern for a comment line
function mmAt(re, s, at) { re.lastIndex = at; return re.test(s); }
// A DIAGRAM'S NAMES. The diagram library keeps a diagram's shapes, classes, entities, states and the rest in plain objects keyed by the name
// the source gives them, as it stands: a shape called __proto__ would write onto the prototype every object of the page shares (and the app
// and the library would then misread everything they hold). So that name never reaches it: wherever __proto__ stands as a word of its own
// — no letter, digit or _ next to it — it is written _proto_ (a label that says the word reads _proto_; a longer name that holds it, and the
// address of a canonical line, are left as they are). A built flowchart's node with that id compiles under _proto_ too (mmId).
var MM_PROTO = /(^|[^A-Za-z0-9_])__proto__(?![A-Za-z0-9_])/g;
function mmKey(line) { return line.indexOf('__proto__') < 0 ? line : line.replace(MM_PROTO, '$1_proto_'); }
// The kind of diagram a source is, as the library will tell it: 'flow', 'class' or '' (any other kind, and whatever cannot be told)
function mmKind(s) {
    var t = String(s).replace(/\r\n?/g, '\n');
    if (/^\s*---/.test(t)) return '';
    t = t.replace(MM_BLOCK, '');
    if (t.indexOf('%%{') >= 0) return '';
    t = t.replace(MM_COMMENT, '').replace(/^\s+/, '');
    return /^(?:flowchart|graph)/.test(t) ? 'flow' : /^classDiagram/.test(t) ? 'class' : '';
}
// A directive statement (from its first word to the end of its line) as the canonical line — '' when it is not a link of this kind of diagram
function mmCanon(stmt, kind) {
    var m;
    if (kind === 'flow') { m = /^\s*click\s+(\S+)\s+(?:href\s+)?"([^"]*)"/.exec(stmt); return m ? linkLine(m[1], m[2]) : ''; }
    if (kind === 'class') { m = /^\s*(?:click\s+(\S+)\s+href|link\s+(\S+))\s+"([^"]*)"/.exec(stmt); return m ? linkLine(m[1] || m[2], m[3]) : ''; }
    return '';
}
function mmCut(s, kind) {
    var seq = /sequenceDiagram/i.test(s), out = [];
    function directive(line, at) { return mmAt(MM_DIRECTIVE, line, at) || mmAt(MM_LINK, line, at) || (seq && mmAt(MM_SEQ_LINK, line, at)); }
    function past(line, at) { MM_NOSEP.lastIndex = at; return MM_NOSEP.test(line) ? MM_NOSEP.lastIndex : at; }   // where a statement begins, past those that need no separator
    s.split(/\r\n|\n|\r/).forEach(function(line) {
        if (directive(line, 0)) { var whole = mmCanon(line, kind); if (whole) out.push(whole); return; }
        var canon = '', cut = false;
        // where a statement begins: the line's start, after a ';' (not one that closes a #…; entity) and after a '}' — in the line's order
        for (var at = 0; at >= 0 && !cut; at = (function(i) { var a = line.indexOf(';', i), b = line.indexOf('}', i); return a < 0 ? b : b < 0 ? a : Math.min(a, b); })(at + 1)) {
            var semi = line.charAt(at) === ';', from = at === 0 && !semi && line.charAt(0) !== '}' ? 0 : at + 1;
            if (semi) { var k = at - 1; while (k >= 0 && /\w/.test(line.charAt(k))) k--; if (k < at - 1 && k >= 0 && line.charAt(k) === '#') continue; }   // the ';' that closes a #…; entity
            var p = past(line, from);
            if (!directive(line, p)) continue;
            canon = mmCanon(line.slice(p), kind); cut = true;
            line = p === from && semi ? line.slice(0, at) : line.slice(0, p).replace(/\s+$/, '');   // after a ';' as before; after the others, they stay
        }
        if (!cut || line.trim()) out.push(mmKey(line));
        if (canon) out.push(canon);
    });
    return out.join('\n');
}
function mmOwn(s) { return s.split('\n').filter(function(l) { return !!readLinkLine(l); }).join('\n'); }   // a source's canonical lines, in order
function mmStrip(s, depth) {
    var kind = mmKind(s), r = mmCut(s, kind);
    if (kind && mmKind(r) !== kind) r = mmCut(s, '');   // a link is kept only where what is handed over is still that kind of diagram
    if (r.indexOf('%%{') < 0) return r;
    var once = r.replace(MM_BLOCK, ''), all = once, mine = mmOwn(r);
    for (var k = 0; k < 8 && all.indexOf('%%{') >= 0; k++) { var nx = all.replace(MM_BLOCK, ''); if (nx === all) break; all = nx; }
    function still(x) { return mmCut(x, mmKind(x)) === x && mmOwn(x) === mine; }   // nothing to strip, and no link line but the ones written here
    if (still(once) && still(all)) return r;
    return depth >= 8 ? '' : mmStrip(mmCut(all, mmKind(all)), depth + 1);
}
function stripMermaidLinks(src, compiled) {
    var s = String(src || '');
    if (compiled === true) return s.split(/\r?\n/).filter(function(line) { return !mmAt(MM_DIRECTIVE, line, 0) || !!readLinkLine(line); }).join('\n');
    return mmStrip(s.replace(/\u0000/g, ''), 0);
}
// What a planner's preview hands the diagram library for a diagram block. The library reads the <pre>'s markup with its character
// references read once — and the sanitiser has by then read the typed ones and dropped the tags it does not keep — so the text the
// library will read is judged here once more: where it holds a directive (one written with a character reference, split by a tag
// or a comment, made by a separator written as a reference) that text is handed over stripped, escaped so that it reads back as
// exactly itself. A block that hides none is the sanitiser's own output, byte for byte as before (a typed <br>, &amp; or &lt;
// reads as it always did).
function mermaidPre(src) {
    var h = sanitizeHtml(stripMermaidLinks(src)), m = decodeEntities(h), c = stripMermaidLinks(m);
    return c === m ? h : esc(c);
}

/* ---------- cleanDoc: the wire sanitizer and the client-side normaliser ---------- */
function str(v, cap) { if (v == null) return ''; v = typeof v === 'string' ? v : (typeof v === 'number' || typeof v === 'boolean') ? String(v) : ''; return v.length > cap ? v.slice(0, cap) : v; }
function num(v, lo, hi, dflt) { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt; }
function safeSrc(v) {
    if (typeof v !== 'string' || v.indexOf('/saves/images/') !== 0) return '';
    if (/[\u0000-\u001f\u007f?#]/.test(v) || v.indexOf('..') !== -1 || v.length > 600) return '';
    return v;
}
// A table row as an array of cells: arrays as they are, the planner grid's { col1, col2, … } objects
// by their numbered keys (so a row typed in the editor keeps every column even before the headers exist)
function rowCells(r) {
    if (Array.isArray(r)) return r.slice(0, LIMITS.cols);
    if (!r || typeof r !== 'object') return [];
    var n = 0;
    Object.keys(r).forEach(function(k) { var m = /^col([1-9][0-9]?)$/.exec(k); if (m) n = Math.max(n, +m[1]); });
    var a = []; for (var i = 1; i <= Math.min(n, LIMITS.cols); i++) a.push(r['col' + i] == null ? '' : r['col' + i]);
    return a;
}
function newId(used) { var id; do { id = 'b_' + Math.random().toString(36).slice(2, 8); } while (used[id]); used[id] = 1; return id; }
var WIDTHS = [25, 33, 50, 66, 75, 100];
function cleanLayout(l, ctx) {
    if (!l || typeof l !== 'object') return null;
    var w = num(l.width, 25, 100, 100);
    w = WIDTHS.reduce(function(best, x) { return Math.abs(x - w) < Math.abs(best - w) ? x : best; }, 100);   // snapped to the nearest step the editor offers
    var fl = l.float === 'left' || l.float === 'right' ? l.float : 'none';
    var span = l.span === true;
    if (span) fl = 'none';                                   // column-span applies to in-flow boxes only
    if (ctx && ctx.cols > 1 && ctx.noFloat) { fl = 'none'; if (w < 50) w = 50; }   // a callout in a narrow column
    var out = { width: w, float: fl, dx: Math.round(num(l.dx, -200, 200, 0)), dy: Math.round(num(l.dy, -200, 200, 0)), span: span };
    if (out.width === 100 && out.float === 'none' && !out.dx && !out.dy && !out.span) return null;   // the default: nothing to carry
    return out;
}
// The block's layout object; a picture placed before the layout controls existed carries the
// planner's own `width` field, which counts as its width here so nothing on a page changes size.
function effectiveLayout(b) {
    var l = b && b.layout;
    if ((!l || typeof l !== 'object') && b && b.type === 'image' && isFinite(Number(b.width)) && Number(b.width) > 0 && Number(b.width) < 100) l = { width: Number(b.width) };
    return l && typeof l === 'object' ? l : null;
}
// a plain field's format on the wire: cleaned against the text as it is sent (the capped one), kept only when something is left
function keepFmt(o, b, k) { var f = cleanFmt(fieldFmt(b, k), o[k]); if (f) { if (!o.fmt) o.fmt = {}; o.fmt[k] = f; } }
var LAYOUT_OK = { image: 1, callout: 1, flare: 1, table: 1, diagram: 1, flowchart: 1 };
var NO_FLOAT_IN_COLS = { callout: 1, flare: 1 };
function cleanBlock(b, used, ctx) {
    if (!b || typeof b !== 'object' || DOC_BLOCKS.indexOf(b.type) < 0) return null;
    var o = { type: b.type };
    o.id = (typeof b.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(b.id) && !used[b.id]) ? b.id : newId(used);
    used[o.id] = 1;
    switch (b.type) {
        case 'h1': o.title = str(b.title, LIMITS.title); o.sub = str(b.sub, LIMITS.title); keepFmt(o, b, 'title'); keepFmt(o, b, 'sub'); break;
        case 'h2': o.title = str(b.title, LIMITS.title); o.cols = Math.round(num(b.cols, 1, 3, 1)); ctx.cols = o.cols; keepFmt(o, b, 'title'); break;
        case 'h3': o.title = str(b.title, LIMITS.title); keepFmt(o, b, 'title'); break;
        case 'rule': break;
        case 'image': o.src = safeSrc(b.src); o.caption = str(b.caption, LIMITS.caption); o.alt = str(b.alt, LIMITS.caption); keepFmt(o, b, 'caption'); break;
        case 'table':
            o.title = str(b.title, LIMITS.title);
            o.cols = (Array.isArray(b.cols) ? b.cols : []).slice(0, LIMITS.cols).map(function(c) { return str(c, LIMITS.title); });
            o.rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, LIMITS.rows).map(function(r) { return rowCells(r).map(function(c) { return str(c, LIMITS.cell); }); });
            keepFmt(o, b, 'title');
            var cfT = fmtList(o.cols, function(ci) { return colFmtOf(b, ci); }); if (cfT) o.colFmt = cfT;
            var lastRf = -1, rfT = o.rows.map(function(cells, ri) { var one = fmtList(cells, function(ci) { return cellFmtOf(b, ri, ci); }); if (one) lastRf = ri; return one || null; });   // rows travel as lists, so a row's cell formats travel beside them
            if (lastRf >= 0) o.rowFmt = rfT.slice(0, lastRf + 1);
            break;
        case 'diagram': o.content = stripMermaidLinks(str(b.content, LIMITS.html)); break;
        case 'flowchart':
            o.dir = /^(TD|LR|BT|RL)$/.test(b.dir || '') ? b.dir : 'TD';
            o.space = /^(compact|normal|wide)$/.test(b.space || '') ? b.space : 'normal';
            o.zoom = num(b.zoom, 0.25, 4, 1);
            if (isFinite(Number(b.boxW)) && Number(b.boxW) > 0) o.boxW = Math.round(num(b.boxW, 80, 4000, 0));
            if (isFinite(Number(b.boxH)) && Number(b.boxH) > 0) o.boxH = Math.round(num(b.boxH, 60, 4000, 0));
            o.nodes = (Array.isArray(b.nodes) ? b.nodes : []).slice(0, LIMITS.nodes).map(function(n) {
                n = n && typeof n === 'object' ? n : {};
                var on = { id: str(n.id, 40), text: str(n.text, LIMITS.cell), shape: /^(rect|rounded|pill|diamond|hex)$/.test(n.shape || '') ? n.shape : 'rect', color: /^(gold|blue|green|red|violet|neutral)$/.test(n.color || '') ? n.color : 'neutral' };
                var nf = labelFmt(own(n, 'fmt') ? n.fmt : undefined, on.text); if (nf) on.fmt = nf;
                var nl = own(n, 'link') ? diagramLink(n.link) : ''; if (nl) on.link = nl;   // the whole node's link, by the one rule (an arrow carries none)
                return on;
            });
            o.edges = (Array.isArray(b.edges) ? b.edges : []).slice(0, LIMITS.edges).map(function(e) {
                e = e && typeof e === 'object' ? e : {};
                var oe = { from: str(e.from, 40), to: str(e.to, 40), text: str(e.text, LIMITS.caption), style: e.style === 'dotted' ? 'dotted' : 'solid' };
                var ef = labelFmt(own(e, 'fmt') ? e.fmt : undefined, oe.text); if (ef) oe.fmt = ef;
                return oe;
            });
            // the GM's hand nudges and node sizes ride along (numbers only, keyed by node id) so players
            // see the chart as arranged: planner.js fcApplyNudges / fcApplySizes read nodePos, nodeSize, nodePosSig
            if (b.nodePos && typeof b.nodePos === 'object' && !Array.isArray(b.nodePos)) {
                var nd = {}, nk = 0;
                Object.keys(b.nodePos).forEach(function(k) { if (nk++ > LIMITS.nodes || !/^[A-Za-z0-9_]{1,40}$/.test(k) || (k in Object.prototype) || k === 'BYTES_PER_ELEMENT') return; var v = b.nodePos[k]; if (v && typeof v === 'object') nd[k] = { x: num(v.x, -1e5, 1e5, 0), y: num(v.y, -1e5, 1e5, 0) }; });
                if (Object.keys(nd).length) o.nodePos = nd;
            }
            if (b.nodeSize && typeof b.nodeSize === 'object' && !Array.isArray(b.nodeSize)) {
                var sz = {}, sk = 0;
                Object.keys(b.nodeSize).forEach(function(k) { if (sk++ > LIMITS.nodes || !/^[A-Za-z0-9_]{1,40}$/.test(k) || (k in Object.prototype) || k === 'BYTES_PER_ELEMENT') return; var v = b.nodeSize[k]; if (v && typeof v === 'object') sz[k] = { x: num(v.x, 0.1, 10, 1), y: num(v.y, 0.1, 10, 1) }; });
                if (Object.keys(sz).length) o.nodeSize = sz;
            }
            if (o.nodePos || o.nodeSize) o.nodePosSig = str(b.nodePosSig, 8000);
            break;
        default:   // prose
            o.content = sanitizeHtml(str(b.content, LIMITS.html));
    }
    if (LAYOUT_OK[b.type]) { var l = cleanLayout(effectiveLayout(b), { cols: ctx.cols, noFloat: !!NO_FLOAT_IN_COLS[b.type] }); if (l) o.layout = l; }
    return o;
}
// opts.keepHidden: keep a page whose players switch is off (the client normalising what it received,
// the GM's own preview). Without it a GM-only page is null: nothing leaves the host.
/* ---------- document appearance (optional per-doc / per-campaign overrides) ----------
   A curated, safe styling layer. Fonts come from a fixed list (never an arbitrary font-family),
   colors must be plain hex, and a background image is a picture reference resolved through
   opts.src to a served asset. Every value is validated or dropped, so a themed page that travels
   to a player can never inject CSS. An absent field falls back to the campaign default, then the
   app's own style. */
// Single-quoted font names on purpose: the CSS goes into a double-quoted style="" attribute, so a
// double quote inside would truncate it (and every value here is from this fixed list, never input).
var DOC_FONTS = {
    serif:   "Georgia, 'Times New Roman', serif",
    sans:    "'Segoe UI', system-ui, 'Helvetica Neue', Arial, sans-serif",
    mono:    "Consolas, 'SF Mono', 'Roboto Mono', monospace",
    slab:    "Rockwell, 'Roboto Slab', Georgia, serif",
    display: "'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif",
    hand:    "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive",
    inter:   "Inter, system-ui, 'Segoe UI', sans-serif"   // Stage 6: bundled (assets/fonts/inter, SIL OFL 1.1)
};
function safeHex(v) { return (typeof v === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) ? v : ''; }
// A stored background-image reference: a picture path exactly as the library stores it (uploads keep their
// original file names, so spaces, quotes and parentheses are normal — docBgImage percent-encodes them at
// emit time). Refused: only what can never be a served path — control characters, backslashes, angle
// brackets, a ".." segment (also percent-spelled), and anything that is not an app-served path — a scheme
// (https:, data:, javascript:) or a protocol-relative //host — so a hostile host can never make a player's
// browser fetch a URL of its choosing.
function safeImgRef(v) { return (typeof v === 'string' && v && v.length <= 400 && !/[\x00-\x1f\\<>]/.test(v) && !/(^|\/)\.\.(\/|$)/.test(v) && !/%2e/i.test(v) && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v) && v.indexOf('//') !== 0) ? v : ''; }
function cleanDocStyle(s) {
    if (!s || typeof s !== 'object') return null;
    var out = {};
    if (typeof s.font === 'string' && Object.prototype.hasOwnProperty.call(DOC_FONTS, s.font)) out.font = s.font;
    var tc = safeHex(s.textColor); if (tc) out.textColor = tc;
    var bc = safeHex(s.bgColor); if (bc) out.bgColor = bc;
    var bi = safeImgRef(s.bgImage); if (bi) out.bgImage = bi;
    // bgDim: how much to darken a background image so light text stays readable (0-90%, kept even at 0 so a page can override an inherited scrim).
    if (typeof s.bgDim === 'number' && isFinite(s.bgDim)) out.bgDim = Math.max(0, Math.min(90, Math.round(s.bgDim)));
    return Object.keys(out).length ? out : null;
}
// Merge a per-doc style over a base (the campaign default); each field falls back on its own.
function mergeDocStyle(base, over) {
    var b = cleanDocStyle(base) || {}, o = cleanDocStyle(over) || {}, m = {};
    ['font', 'textColor', 'bgColor', 'bgImage'].forEach(function(k) { if (o[k]) m[k] = o[k]; else if (b[k]) m[k] = b[k]; });
    if (Object.prototype.hasOwnProperty.call(o, 'bgDim')) m.bgDim = o.bgDim; else if (Object.prototype.hasOwnProperty.call(b, 'bgDim')) m.bgDim = b.bgDim;   // a number, so 0 must win over an inherited scrim
    return Object.keys(m).length ? m : null;
}
// The background-image VALUE for a resolved style — the readability scrim (bgDim) over the picture — or ''.
// srcOf turns the stored reference into a URL (identity for the GM, net.assetSrc for a player). A served path
// is percent-encoded so a file name with spaces, quotes or parentheses can never break out of url('…') (the
// core decodes it when serving); a data:/blob: URL (a player's cached or placeholder picture) is used as-is.
// Anything still url()-unsafe after that yields nothing. Shared by pages (docStyleCss), the reader's re-patch
// and the character sheet.
function docBgImage(style, srcOf) {
    style = cleanDocStyle(style); if (!style || !style.bgImage) return '';
    var u = (typeof srcOf === 'function' ? srcOf(style.bgImage) : style.bgImage);
    if (typeof u !== 'string' || !u) return '';
    if (!/^(data:|blob:)/.test(u)) { try { u = encodeURI(u).replace(/[()']/g, function(c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); }); } catch (e) { return ''; } }
    if (/[\s'"()\\]/.test(u)) return '';
    var dim = (typeof style.bgDim === 'number') ? style.bgDim : 0;
    return (dim > 0 ? 'linear-gradient(rgba(0,0,0,' + (dim / 100) + '),rgba(0,0,0,' + (dim / 100) + ')),' : '') + "url('" + u + "')";
}
// Inline CSS for a resolved style. srcOf turns a bgImage reference into a URL (identity for the GM).
function docStyleCss(style, srcOf) {
    style = cleanDocStyle(style); if (!style) return '';
    var css = '';
    if (style.font && DOC_FONTS[style.font]) css += 'font-family:' + DOC_FONTS[style.font] + ';';
    if (style.textColor) css += 'color:' + style.textColor + ';';
    if (style.bgColor) css += 'background-color:' + style.bgColor + ';';
    var bg = docBgImage(style, srcOf); if (bg) css += 'background-image:' + bg + ';background-size:cover;background-position:center;';
    return css;
}
function cleanDoc(doc, opts) {
    opts = opts || {};
    if (!doc || typeof doc !== 'object' || doc.type !== 'doc') return null;
    var meta = doc.meta && typeof doc.meta === 'object' ? doc.meta : {};
    var players = meta.players !== false;
    if (!players && !opts.keepHidden) return null;
    var out = { type: 'doc', id: str(doc.id, 80) || ('doc_' + Math.random().toString(36).slice(2, 8)), meta: { title: str(meta.title, LIMITS.title) || 'Page', updated: num(meta.updated, 0, 1e14, 0), players: players }, blocks: [] };
    var _dstyle = cleanDocStyle(meta.style); if (_dstyle) out.meta.style = _dstyle;   // optional appearance override; validated, so it is safe to send to players
    if (typeof meta.parentId === 'string' && meta.parentId) out.meta.parentId = str(meta.parentId, 80);
    if (typeof meta.sortIndex === 'number' && isFinite(meta.sortIndex)) out.meta.sortIndex = meta.sortIndex;
    var used = Object.create(null), ctx = { cols: 1 }, bytes = 0, truncated = false;   // prototype-free: a block id of "__proto__" is just a string
    var src = Array.isArray(doc.blocks) ? doc.blocks : [];
    for (var i = 0; i < src.length; i++) {
        if (out.blocks.length >= LIMITS.blocks) { truncated = true; break; }
        var c = cleanBlock(src[i], used, ctx);
        if (!c) continue;
        bytes += JSON.stringify(c).length;
        if (bytes > LIMITS.bytes) { truncated = true; break; }
        out.blocks.push(c);
    }
    if (truncated) out.blocks.push({ id: newId(used), type: 'text', content: '<p>This page is too long to send; ask the GM for a copy.</p>' });
    return out;
}

/* ---------- renderDoc ---------- */
function layoutAttrs(b, cls) {
    var l = effectiveLayout(b), classes = cls || '', style = '';
    if (l) {
        if (l.float === 'left') classes += ' fl-left'; else if (l.float === 'right') classes += ' fl-right';
        if (l.span) classes += ' doc-span';
        var lw = l.width ? num(l.width, 1, 100, 100) : 100, ldx = num(l.dx, -200, 200, 0), ldy = num(l.dy, -200, 200, 0);   // numbers, even for a block that never met cleanDoc
        if (lw !== 100) style += 'width:' + lw + '%;';
        if (ldx || ldy) style += 'position:relative;left:' + ldx + 'px;top:' + ldy + 'px;';
    }
    return ' class="' + classes.trim() + '"' + (style ? ' style="' + style + '"' : '');
}
// opts.src(path): how an image path becomes a URL (identity for the GM, net.assetSrc for a player).
// opts.mermaid: false renders diagram sources as plain code (no mermaid on this machine).
// opts.empty: the HTML shown for a page with no blocks (the GM's preview hint); default nothing.
function renderDoc(doc, opts) {
    opts = opts || {};
    var srcOf = typeof opts.src === 'function' ? opts.src : function(p) { return p; };
    var blocks = doc && Array.isArray(doc.blocks) ? doc.blocks : [];
    var _effStyle = mergeDocStyle(opts.docStyle, doc && doc.meta && doc.meta.style);   // per-doc over campaign default
    var _wrapCss = docStyleCss(_effStyle, srcOf);
    var _bgPath = (_effStyle && _effStyle.bgImage) ? ' data-bgpath="' + esc(_effStyle.bgImage) + '" data-bgdim="' + (typeof _effStyle.bgDim === 'number' ? _effStyle.bgDim : 0) + '"' : '';   // so a client can re-apply the background once the picture's bytes arrive (wp-asset)
    var html = '<div class="wrap"' + (_wrapCss ? ' style="' + _wrapCss + '"' : '') + _bgPath + '>', section = false, cols = 1;
    if (!blocks.length && opts.empty) html += opts.empty;
    function closeSection() { if (section) { html += '</div><div class="doc-clear"></div>'; section = false; } }
    blocks.forEach(function(b, i) {
        if (!b || typeof b !== 'object') return;
        if (b.type === 'h1' || b.type === 'h2') {
            closeSection();
            if (b.type === 'h2') { cols = Math.max(1, Math.min(3, Math.round(Number(b.cols) || 1))); }
        }
        var blk = '<div class="pv-blk" data-blk="' + i + '">';
        switch (b.type) {
            case 'h1': blk += '<h1>' + fmtHtml(b.title, fieldFmt(b, 'title')) + (b.sub ? '<span class="sub">' + fmtHtml(b.sub, fieldFmt(b, 'sub')) + '</span>' : '') + '</h1>'; break;
            case 'h2': blk += '<h2>' + fmtHtml(b.title, fieldFmt(b, 'title')) + '</h2>'; break;
            case 'h3': blk += '<h3 class="doc-h3">' + fmtHtml(b.title, fieldFmt(b, 'title')) + '</h3>'; break;
            case 'rule': blk += '<hr class="doc-rule">'; break;
            case 'text': blk += proseHtml(b.content, 'text'); break;
            case 'lede': blk += '<p class="lede">' + proseHtml(b.content) + '</p>'; break;
            case 'oneline': blk += '<div class="oneline">' + proseHtml(b.content) + '</div>'; break;
            case 'callout': blk += '<div' + layoutAttrs(b, 'callout') + '>' + proseHtml(b.content) + '</div>'; break;
            case 'flare': blk += '<div' + layoutAttrs(b, 'flare') + '>' + proseHtml(b.content) + '</div>'; break;
            case 'image': {
                var p = safeSrc(b.src);
                if (p) blk += '<figure' + layoutAttrs(b, 'doc-img planner-img') + '><img src="' + esc(srcOf(p)) + '" data-path="' + esc(p) + '" alt="' + esc(b.alt || b.caption || '') + '">' + (b.caption ? '<figcaption>' + fmtHtml(b.caption, fieldFmt(b, 'caption')) + '</figcaption>' : '') + '</figure>';
                else blk += '<figure' + layoutAttrs(b, 'doc-img planner-img doc-img-empty') + '><div class="doc-noimg">No picture yet</div>' + (b.caption ? '<figcaption>' + fmtHtml(b.caption, fieldFmt(b, 'caption')) + '</figcaption>' : '') + '</figure>';
                break;
            }
            case 'table': {
                var tcols = Array.isArray(b.cols) ? b.cols.slice(0, LIMITS.cols) : [], rows = (Array.isArray(b.rows) ? b.rows : []).map(rowCells);
                var ncol = Math.max(tcols.length, rows.reduce(function(m, r) { return Math.max(m, r.length); }, 0), 1);
                blk += '<div' + layoutAttrs(b, 'node plain-table doc-tablewrap') + '>';
                if (b.title) blk += '<h3>' + fmtHtml(b.title, fieldFmt(b, 'title')) + '</h3>';
                blk += '<table class="doc-table">';
                if (tcols.length) { blk += '<thead><tr>'; for (var c = 0; c < ncol; c++) blk += '<th>' + fmtHtml(tcols[c] || '', colFmtOf(b, c)) + '</th>'; blk += '</tr></thead>'; }
                blk += '<tbody>';
                rows.forEach(function(r, ri) { blk += '<tr>'; for (var c2 = 0; c2 < ncol; c2++) blk += '<td>' + fmtHtml(r[c2] || '', cellFmtOf(b, ri, c2)) + '</td>'; blk += '</tr>'; });
                blk += '</tbody></table></div>';
                break;
            }
            case 'diagram': {
                var srcD = stripMermaidLinks(b.content);
                blk += '<div' + layoutAttrs(b, 'diagram') + '>' + (opts.mermaid === false ? '<pre class="doc-code">' + esc(srcD) + '</pre>' : '<pre class="mermaid">' + esc(srcD) + '</pre>') + '</div>';
                break;
            }
            case 'flowchart': {
                var l = effectiveLayout(b) || {}, boxStyle = (b.boxW ? 'width:' + Math.round(Number(b.boxW)) + 'px;' : '') + (b.boxH ? 'height:' + Math.round(Number(b.boxH)) + 'px;' : '');
                var fdx = num(l.dx, -200, 200, 0), fdy = num(l.dy, -200, 200, 0);
                if (fdx || fdy) boxStyle += 'position:relative;left:' + fdx + 'px;top:' + fdy + 'px;';
                var fcls = 'diagram fc-box' + (l.float === 'left' ? ' fl-left' : l.float === 'right' ? ' fl-right' : '') + (l.span ? ' doc-span' : '');
                blk += '<div class="' + fcls + '" data-fc="' + i + '" style="' + boxStyle + '"><pre class="mermaid">' + esc(stripMermaidLinks(compileFlowchart(b), true)) + '</pre></div>';
                break;
            }
            default: return;   // an unknown type renders nothing
        }
        blk += '</div>';
        html += blk;
        if (b.type === 'h2' && cols > 1) { html += '<div class="doc-section doc-cols-' + cols + '">'; section = true; }
    });
    closeSection();
    html += '</div>';
    return html;
}

/* ---------- Stage 6 HUD H12: the handbook search (a sheet or HUD placement; the reference's Handbook tab) ----------
   Plain text only, over the viewer's own pages: a page's parts under each heading (h1, h2, h3), searched by heading as the viewer types
   (every word, any order, in the page's title or a heading) and in the text on request (every word under one heading, the phrase first),
   capped. Nothing here makes markup: the caller draws with text nodes. Folding keeps one character per character, so a place found in the
   folded text is the same place in the text. */
var HB_LIMIT = 60;
function hbFold(s) { s = String(s == null ? '' : s); var out = ''; for (var i = 0; i < s.length; i++) { var c = s.charAt(i), f = (c.normalize ? c.normalize('NFD').charAt(0) : c).toLowerCase(); out += f.length === 1 ? f : c; } return out; }
function hbPlain(html) { return decodeEntities(str(html, LIMITS.html).replace(/<(br|\/p|\/li|\/div|\/h[1-6])\b[^>]*>/gi, ' ').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim(); }
function hbBlockText(b) {
    switch (b.type) {
        case 'text': case 'lede': case 'oneline': case 'callout': case 'flare': return hbPlain(b.content);
        case 'table': return [str(b.title, LIMITS.title)].concat(Array.isArray(b.cols) ? b.cols.map(function(x) { return str(x, LIMITS.title); }) : [], (Array.isArray(b.rows) ? b.rows : []).map(function(r) { return rowCells(r).map(function(x) { return str(x, LIMITS.cell); }).join(' '); })).join(' ');
        case 'image': return str(b.caption, LIMITS.caption);
        default: return '';
    }
}
// [{ bi, level, title, text }]: bi is the heading's block (-1: the part before the first heading, its title the page's)
function hbSections(doc) {
    var blocks = doc && Array.isArray(doc.blocks) ? doc.blocks : [], out = [], cur = { bi: -1, level: 0, title: '', parts: [] };
    var push = function(s) { var text = s.parts.join(' ').replace(/\s+/g, ' ').trim(); if (s.bi < 0 && !text) return; out.push({ bi: s.bi, level: s.level, title: s.title, text: text }); };
    blocks.forEach(function(b, i) {
        if (!b || typeof b !== 'object') return;
        if (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') { push(cur); cur = { bi: i, level: +b.type.charAt(1), title: str(b.title, LIMITS.title).replace(/\s+/g, ' ').trim(), parts: [] }; if (b.type === 'h1' && b.sub) cur.parts.push(str(b.sub, LIMITS.title)); return; }
        var t = hbBlockText(b); if (t) cur.parts.push(t);
    });
    push(cur);
    return out;
}
function hbWords(q) { return hbFold(q).split(/\s+/).filter(Boolean).slice(0, 12); }
function hbAll(f, words) { return words.every(function(w) { return f.indexOf(w) >= 0; }); }
// pages: [{ id, title, doc }]; the pages whose title or headings hold every word — the title first, then the most headings
function hbHeadings(pages, q) {
    var words = hbWords(q), out = []; if (!words.length) return out;
    (Array.isArray(pages) ? pages : []).forEach(function(p) {
        if (!p || typeof p.id !== 'string') return;
        var t = String(p.title == null ? '' : p.title), heads = [];
        hbSections(p.doc).forEach(function(s) { if (s.bi >= 0 && s.title && hbAll(hbFold(s.title), words)) heads.push({ bi: s.bi, title: s.title }); });
        var inTitle = hbAll(hbFold(t), words); if (!inTitle && !heads.length) return;
        out.push({ id: p.id, title: t, inTitle: inTitle, heads: heads });
    });
    out.sort(function(a, b) { return (+b.inTitle - +a.inTitle) || (b.heads.length - a.heads.length) || a.title.localeCompare(b.title); });
    return out;
}
// the parts that hold every word (under a heading, its title counts): the phrase first, then the heading's own match; each with a
// snippet around the phrase (else the first word the text holds) as before / hit / after; at most HB_LIMIT (over: there were more)
function hbText(pages, q) {
    var words = hbWords(q), phrase = words.join(' '), hits = [];
    if (!words.length || phrase.length < 2) return { hits: hits, over: false };
    (Array.isArray(pages) ? pages : []).forEach(function(p) {
        if (!p || typeof p.id !== 'string') return;
        var pt = String(p.title == null ? '' : p.title);
        hbSections(p.doc).forEach(function(s) {
            var body = s.text, fb = hbFold(body); if (!hbAll(hbFold(s.title) + ' ' + fb, words)) return;
            var ph = fb.indexOf(phrase), at = ph, len = phrase.length; if (at < 0) words.some(function(w) { var i = fb.indexOf(w); if (i < 0) return false; at = i; len = w.length; return true; });
            var h = { id: p.id, page: pt, bi: s.bi, head: s.bi >= 0 ? s.title : '', score: (ph >= 0 ? 100 : 0) + (hbAll(hbFold(s.title), words) ? 10 : 0), before: '', hit: '', after: '' };
            if (at < 0) h.before = body.slice(0, 120) + (body.length > 120 ? '\u2026' : '');
            else { h.before = (at > 50 ? '\u2026' : '') + body.slice(Math.max(0, at - 50), at); h.hit = body.slice(at, at + len); h.after = body.slice(at + len, at + len + 90) + (at + len + 90 < body.length ? '\u2026' : ''); }
            hits.push(h);
        });
    });
    hits.sort(function(a, b) { return b.score - a.score || a.page.localeCompare(b.page) || a.bi - b.bi; });
    return { hits: hits.slice(0, HB_LIMIT), over: hits.length > HB_LIMIT };
}

var API = { VERSION: VERSION, hbFold: hbFold, hbSections: hbSections, hbHeadings: hbHeadings, hbText: hbText, HB_LIMIT: HB_LIMIT, LIMITS: LIMITS, DOC_BLOCKS: DOC_BLOCKS.slice(), sanitizeHtml: sanitizeHtml, sanitizeBare: sanitizeBare, fmtHtml: fmtHtml, fmtRich: fmtRich, cleanBlockFmts: cleanBlockFmts, labelFmt: labelFmt, fieldFmt: fieldFmt, colFmtOf: colFmtOf, cellFmtOf: cellFmtOf, cleanDoc: cleanDoc, renderDoc: renderDoc, proseHtml: proseHtml, nl: nl, compileFlowchart: compileFlowchart, stripMermaidLinks: stripMermaidLinks, mermaidPre: mermaidPre, diagramLink: diagramLink, linkLine: linkLine, readLinkLine: readLinkLine, esc: esc, cleanDocStyle: cleanDocStyle, mergeDocStyle: mergeDocStyle, docStyleCss: docStyleCss, docBgImage: docBgImage, DOC_FONTS: DOC_FONTS };
if (typeof window !== 'undefined') window.wpDocRender = API;
export { VERSION, hbFold, hbSections, hbHeadings, hbText, HB_LIMIT, LIMITS, DOC_BLOCKS, sanitizeHtml, sanitizeBare, fmtHtml, fmtRich, cleanBlockFmts, labelFmt, fieldFmt, colFmtOf, cellFmtOf, cleanDoc, renderDoc, proseHtml, nl, compileFlowchart, stripMermaidLinks, mermaidPre, diagramLink, linkLine, readLinkLine, cleanDocStyle, mergeDocStyle, docStyleCss, docBgImage, DOC_FONTS };

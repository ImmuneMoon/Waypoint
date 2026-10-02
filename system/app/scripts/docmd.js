/* Markdown in and out for planners and handbook pages (1.5.0, handbook slice 3) — the pure half.
   markdownToBlocks(text, opts) turns a Markdown file into planner / page blocks plus notes and a list
   of the pictures it referenced (the caller uploads those and fills in the URLs); docToMarkdown(item)
   writes a planner or page back in the same dialect so the guide is proven by the round trip;
   flowchartFromMermaid reads the simple mermaid subset into the builder's native flowchart block.
   No DOM, no state: the only imports are docrender.js (the sanitizer; where a block keeps its formats)
   and textfmt.js (a format's cleaner), both pure, so tools/doccheck.js runs this under Node. The dialog
   and the entry points live in docimport.js.

   The dialect (also Help ▸ Handbook ▸ Import and export, and TEMPLATE below):
     front matter title / subtitle / status (planners) / players (pages); the first `#` is the title
     (an italic-only line right under it the subtitle), later `#` and every `##` a section (`{cols=2}`
     tail = columns on a page), `###` a sub-heading on a page — in a planner `### Scene:` opens a
     scene node (with `**Tag:**`, `**Must resolve:**`, `Map: title / room` lines and a table under it)
     and other `###` become a bold lead line; paragraphs, lists, `**b**` `*i*` `~~s~~` `<u>` `code`
     `[t](https://…)` form one text block per run; `> quote` = callout, `> [!lede|oneline|flare|callout]`
     and `::: type … :::` pick the prose block; pipe tables (first row headers, at most 8 columns,
     a bold line above = the title); ```mermaid = diagram, ```flowchart / ```graph in the simple
     subset = a native flowchart, other fences = code; `---` = a rule on a page, a run boundary in a
     planner; `![caption](path){width=50 float=left dx=0 dy=0 span}` = a picture (a relative path
     resolved against the files or zip dropped with the .md, `data:` decoded, `https:` kept as a
     link). Raw HTML from a file is never a raw block: unknown tags are dropped, their text kept.
     Text style travels: a text block keeps `<span style="color:#rrggbb">` / `<span style="font-size:1.2em">`
     (the sanitizer's one span form; beside one, the block's bold and italic are written as <b> / <i>
     wherever the marks would not read back; a span lives inside one paragraph); in a title, a cell, a
     caption or a flowchart label, bold, italic and those spans are written from the field's format and
     read back into it ("text style" below). */
'use strict';
import { sanitizeHtml, DOC_BLOCKS, fieldFmt, colFmtOf, cellFmtOf } from './docrender.js';
import { cleanFmt, runsOf, SIZE_EM, MAX_RAW } from './textfmt.js';

var VERSION = '1.5.0';
var LIMITS = { text: 2 * 1024 * 1024, blocks: 300, picture: 8 * 1024 * 1024, cols: 8 };
var PLANNER_BLOCKS = ['h1', 'h2', 'lede', 'oneline', 'text', 'flare', 'callout', 'node', 'image', 'diagram', 'flowchart'];   // raw is never created by an import
var PROSE = { lede: 1, oneline: 1, flare: 1, callout: 1 };
var ATTR_KEYS = { cols: 1, width: 1, float: 1, dx: 1, dy: 1, span: 1 };

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function uid() { return 'b_' + Math.random().toString(36).slice(2, 8); }
var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
function unent(s) { return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function(m, b) { if (b[0] === '#') { var cp = b[1].toLowerCase() === 'x' ? parseInt(b.slice(2), 16) : parseInt(b.slice(1), 10); return isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m; } return Object.prototype.hasOwnProperty.call(ENT, b.toLowerCase()) ? ENT[b.toLowerCase()] : m; }); }

/* ---------- attribute tails: {width=50 float=left} on a heading or a picture ---------- */
// Parsed only when every key is known; otherwise the braces stay part of the text ("Formulas {advanced}").
function parseAttrs(tail) {
    var m = /^\s*\{([^{}]*)\}\s*$/.exec(tail || ''); if (!m) return null;
    var out = {}, ok = true;
    m[1].trim().split(/\s+/).filter(Boolean).forEach(function(kv) { var p = kv.split('='), k = p[0].toLowerCase(); if (!ATTR_KEYS[k]) { ok = false; return; } out[k] = p.length > 1 ? p.slice(1).join('=') : 'true'; });
    return ok && Object.keys(out).length ? out : null;
}
function splitAttrTail(text) {   // "Title {cols=2}" → { text: 'Title', attrs: {cols:'2'} }; unknown keys keep the braces
    var m = /^(.*?)\s*(\{[^{}]*\})\s*$/.exec(text || '');
    if (!m) return { text: text, attrs: null };
    var a = parseAttrs(m[2]);
    return a ? { text: m[1], attrs: a } : { text: text, attrs: null };
}
function layoutFromAttrs(a) {
    if (!a) return null;
    var l = {};
    if (a.width !== undefined) l.width = +a.width;
    if (a.float !== undefined) l.float = String(a.float).toLowerCase();
    if (a.dx !== undefined) l.dx = +a.dx;
    if (a.dy !== undefined) l.dy = +a.dy;
    if (a.span !== undefined && !/^(false|no|0)$/i.test(a.span)) l.span = true;
    return Object.keys(l).length ? l : null;
}

/* ---------- inline Markdown → HTML (allow-listed tags only; the sanitizer runs on every block) ---------- */
function safeUrl(u) { u = String(u || '').trim(); return /^https?:\/\/[^\s]+$/i.test(u) ? u : null; }
// [text](dest "title") | [text][ref] | [text] starting at src[i] === '['. Returns { text, dest, ref, end } or null.
function matchLink(src, i) {
    if (src[i] !== '[') return null;
    var depth = 0, j = i;
    for (; j < src.length; j++) { if (src[j] === '\\') { j++; continue; } if (src[j] === '[') depth++; else if (src[j] === ']') { depth--; if (depth === 0) break; } }
    if (j >= src.length) return null;
    var text = src.slice(i + 1, j), k = j + 1;
    if (src[k] === '(') {   // the destination may hold balanced parentheses: javascript:alert(1), Wikipedia_(film)
        var pd = 0, close = k, body;
        for (; close < src.length; close++) { if (src[close] === '\\') { close++; continue; } if (src[close] === '(') pd++; else if (src[close] === ')') { pd--; if (pd === 0) break; } }
        if (close >= src.length) return null;
        body = src.slice(k + 1, close).trim();
        var dm = /^(<[^>]*>|\S+)(?:\s+("[^"]*"|'[^']*'))?$/.exec(body);
        if (!dm) return null;
        return { text: text, dest: dm[1].replace(/^<|>$/g, ''), ref: null, end: close + 1 };
    }
    if (src[k] === '[') { var rc = src.indexOf(']', k); if (rc < 0) return null; return { text: text, dest: null, ref: (src.slice(k + 1, rc) || text), end: rc + 1 }; }
    return { text: text, dest: null, ref: text, end: k, bare: true };
}
function inline(src, ctx) {
    var out = '', i = 0, n = src.length, rest, m;
    while (i < n) {
        var ch = src[i]; rest = src.slice(i);
        if (ch === '\\' && i + 1 < n && /[\\`*_{}\[\]()#+\-.!~<>|]/.test(src[i + 1])) { out += esc(src[i + 1]); i += 2; continue; }
        if (ch === '`') { m = /^(`+)([\s\S]*?[^`])\1(?!`)/.exec(rest); if (m) { out += '<code>' + esc(m[2].trim()) + '</code>'; i += m[0].length; continue; } }
        if (ch === '!' && src[i + 1] === '[') { var im = matchLink(src, i + 1); if (im && !im.bare) { ctx.inlineImages.push({ caption: im.text, dest: im.dest, ref: im.ref }); i = im.end; var tail = /^\s*\{[^{}]*\}/.exec(src.slice(i)); if (tail && parseAttrs(tail[0])) { ctx.inlineImages[ctx.inlineImages.length - 1].attrs = parseAttrs(tail[0]); i += tail[0].length; } continue; } }
        if (ch === '[') { var lk = matchLink(src, i); if (lk && lk.dest != null) { var href = safeUrl(lk.dest); out += href ? '<a href="' + esc(href) + '">' + inline(lk.text, ctx) + '</a>' : inline(lk.text, ctx); i = lk.end; continue; } }
        if (ch === '<') {
            m = /^<(https?:\/\/[^\s<>]+)>/.exec(rest); if (m) { out += '<a href="' + esc(m[1]) + '">' + esc(m[1]) + '</a>'; i += m[0].length; continue; }
            m = /^<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/.exec(rest); if (m) { out += m[0]; i += m[0].length; continue; }   // HTML from the file: the sanitizer keeps its allow-list, drops the rest
            out += '&lt;'; i++; continue;
        }
        if (ch === '*' || ch === '_') {
            m = new RegExp('^(\\' + ch + '{3})(?=\\S)([\\s\\S]*?\\S)\\1(?!\\' + ch + ')').exec(rest);   // three markers: bold and italic together
            if (m) { out += '<b><i>' + inline(m[2], ctx) + '</i></b>'; i += m[0].length; continue; }
            m = new RegExp('^(\\' + ch + '\\' + ch + ')(?=\\S)([\\s\\S]*?\\S)\\1').exec(rest);   // one character between the markers is a bold too ("**b**")
            if (m) { out += '<b>' + inline(m[2], ctx) + '</b>'; i += m[0].length; continue; }
            m = new RegExp('^(\\' + ch + ')(?=\\S)([^' + (ch === '*' ? '*' : '_') + ']+?\\S|\\S)\\1(?!' + (ch === '*' ? '\\*' : '\\w') + ')').exec(rest);
            if (m) { out += '<i>' + inline(m[2], ctx) + '</i>'; i += m[0].length; continue; }
        }
        if (ch === '~' && src[i + 1] === '~') { m = /^~~(?=\S)([\s\S]+?\S)~~/.exec(rest); if (m) { out += '<s>' + inline(m[1], ctx) + '</s>'; i += m[0].length; continue; } }
        if (ch === '&') { m = /^&(#x[0-9a-f]+|#\d+|[a-z]+);/i.exec(rest); if (m) { out += m[0]; i += m[0].length; continue; } }
        out += esc(ch); i++;
    }
    return out;
}
// Paragraph lines → inline HTML: soft breaks joined by a space, hard breaks (two trailing spaces or a backslash) as <br>
function paraHtml(lines, ctx) {
    var parts = [];
    lines.forEach(function(l, k) { var hard = /( {2,}|\\)$/.test(l); parts.push(inline(l.replace(/( {2,}|\\)$/, '').trim(), ctx) + (hard && k < lines.length - 1 ? '<br>' : '')); });
    return parts.join(' ').replace(/<br> /g, '<br>');
}

/* ---------- lists ---------- */
var LIST_RE = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
function listHtml(lines, ctx) {
    // items with their indent; children nest under the previous item when indented deeper
    var items = [];
    lines.forEach(function(l) {
        var m = LIST_RE.exec(l);
        if (m) items.push({ indent: m[1].replace(/\t/g, '  ').length, ordered: /\d/.test(m[2]), text: m[3] });
        else if (items.length) items[items.length - 1].text += ' ' + l.trim();   // a continuation line
    });
    function build(start, indent) {   // consecutive items at this indent; a change of bullet ↔ number starts a new list
        var html = '', k = start;
        while (k < items.length && items[k].indent >= indent) {
            var ordered = items[k].ordered;
            html += ordered ? '<ol>' : '<ul>';
            while (k < items.length && items[k].indent >= indent && items[k].ordered === ordered) {
                if (items[k].indent > indent) {
                    var sub = build(k, items[k].indent);
                    if (/<\/li>$/.test(html)) html = html.replace(/<\/li>$/, '') + sub.html + '</li>'; else html += '<li>' + sub.html + '</li>';
                    k = sub.next; continue;
                }
                html += '<li>' + inline(items[k].text, ctx) + '</li>'; k++;
            }
            html += ordered ? '</ol>' : '</ul>';
        }
        return { html: html, next: k };
    }
    return items.length ? build(0, items[0].indent).html : '';
}

/* ---------- tables ---------- */
function splitRow(line) {
    var s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    var cells = [], cur = '';
    for (var i = 0; i < s.length; i++) { if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; } else if (s[i] === '|') { cells.push(cur); cur = ''; } else cur += s[i]; }
    cells.push(cur);
    return cells.map(function(c) { return c.trim(); });
}
function isTableSep(line) { return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line || ''); }

/* ---------- text style (1.5.0): a plain field's format, in and out of the dialect ----------
   A title, a cell, a caption, a label is plain text with its format beside it (textfmt.js). In a Markdown file the format is written INTO
   the field's inline text — bold as **…**, italic as *…* (as <b> / <i> where the marks would not read back, or inside a line that is itself
   bold or italic syntax), a colour as the page sanitiser's one span form, the field's size as one span around everything — and read back
   out of it. What is read is only ever what the sanitiser wrote (fmtFromInline), and only where its text is the very text the field is
   given; anything else is the plain text, as before. A look that holds for the whole text is written once, around everything, and comes
   back as the field's own look; every other look as a span. A field with no format is written exactly as it always was. */
var SIZE_OF = {}; Object.keys(SIZE_EM).forEach(function(k) { SIZE_OF[SIZE_EM[k]] = k; });
function ownKey(o, k) { return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }
// The looks of a text as it is walked in order: open(look) … close() around text(length). look: { color, b, i, size } or null (an element that has none)
function lookWalk() {
    var stack = [], els = [], runs = [], n = 0, cur = { color: '', b: false, i: false };
    var wraps = function() { return els.filter(function(el) { return el.s === 0 && (el.e < 0 ? n : el.e) === n; }); };   // around the whole text, outermost first
    return {
        open: function(look) {
            var el = { look: look || null, s: n, e: -1, prev: cur };
            if (look) { cur = { color: look.color || cur.color, b: cur.b || look.b === true, i: cur.i || look.i === true }; els.push(el); }
            stack.push(el);
        },
        close: function() { var el = stack.pop(); if (el) { el.e = n; cur = el.prev; } },
        text: function(len) {
            if (!(len > 0)) return;
            var last = runs[runs.length - 1];
            if (last && last.color === cur.color && last.b === cur.b && last.i === cur.i) last.e = n + len;
            else runs.push({ s: n, e: n + len, color: cur.color, b: cur.b, i: cur.i });
            n += len;
        },
        els: function() { return els; },
        wraps: wraps,
        // The format: what wraps the whole text is the field's own look (of two colours the inner one stands; a size only here: a field has one),
        // every run a span over it — cleaned, so undefined when nothing is left. size: one the caller read itself (a label's <big> / <small>).
        fmt: function(text, size) {
            if (!n || text.length !== n) return undefined;
            var f = { spans: [] };
            wraps().forEach(function(el) { var l = el.look; if (l.size && !f.size) f.size = l.size; if (l.color) f.color = l.color; if (l.b) f.b = true; if (l.i) f.i = true; });
            if (size) f.size = size;
            for (var k = 0; k < runs.length && f.spans.length < MAX_RAW; k++) {
                var r = runs[k]; if (!r.color && !r.b && !r.i) continue;
                var sp = { s: r.s, e: r.e }; if (r.color) sp.color = r.color; if (r.b) sp.b = true; if (r.i) sp.i = true;
                f.spans.push(sp);
            }
            return cleanFmt(f, text);
        }
    };
}
function unesc(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'); }   // the sanitiser's own escaping, undone
// fmtFromInline(html) → { text, fmt }: a plain field read from inline HTML. Built on the page sanitiser's output, never on the input: the
// html goes through sanitizeHtml first and only what that wrote is read — <b> / <strong>, <i> / <em> and its one span form (a strict
// colour; a size step when it is around everything). Whatever else it kept (a link, an underline, code, a paragraph) is just its text,
// and a line break no character. fmt is the cleaner's (textfmt.js cleanFmt): absent when nothing is left.
function fmtFromInline(html) {
    var clean = sanitizeHtml(html), w = lookWalk(), text = '', re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/g, m;
    while ((m = re.exec(clean))) {
        if (m[4] !== undefined) { var t = unesc(m[4]); text += t; w.text(t.length); continue; }
        if (m[2] === 'br') continue;
        if (m[1]) { w.close(); continue; }
        var look = null;
        if (m[2] === 'b' || m[2] === 'strong') look = { b: true };
        else if (m[2] === 'i' || m[2] === 'em') look = { i: true };
        else if (m[2] === 'span') {
            var st = /^ style="(?:color:(#[0-9a-f]{6}))?;?(?:font-size:([0-9.]+em))?"$/.exec(m[3]), size = st && st[2] && ownKey(SIZE_OF, st[2]) ? SIZE_OF[st[2]] : '';
            if (st && (st[1] || size)) look = { color: st[1] || '', size: size };
        }
        w.open(look);
    }
    var out = { text: text }, fmt = w.fmt(text);
    if (fmt) out.fmt = fmt;
    return out;
}
// A plain field from the file's inline Markdown: its text exactly as before (the inline HTML less its tags, entities decoded: cells and
// titles are plain text in the editor's inputs), and the format its bold, italic and colour / size
// spans make — only where the sanitiser's reading of that inline HTML is the very same text (else the field is plain, as before).
function fieldOf(md) {
    var html = inline(md, { inlineImages: [] }), text = unent(html.replace(/<[^>]+>/g, ''));
    if (html.indexOf('<') < 0) return { text: text };
    var r = fmtFromInline(html);
    return r.fmt && r.text === text ? { text: text, fmt: r.fmt } : { text: text };
}
// a field's format on its block (block.fmt.<key>): set, or taken off when there is none
function setFmt(b, k, f) { if (f) { if (!ownKey(b, 'fmt')) b.fmt = {}; b.fmt[k] = f; } else if (ownKey(b, 'fmt')) { delete b.fmt[k]; if (!Object.keys(b.fmt).length) delete b.fmt; } }
function looksOf(text, fmt) { var f = cleanFmt(fmt, text); return JSON.stringify([(f && f.size) || '', runsOf(text, f)]); }
// The look the whole text has — written once, around everything, and read back as the field's own
function wholeLook(f, runs) {
    var c0 = runs.length ? runs[0].color : '';
    return { size: f.size || '', b: runs.every(function(r) { return r.b; }), i: runs.every(function(r) { return r.i; }), color: c0 && runs.every(function(r) { return r.color === c0; }) ? c0 : (f.color || '') };
}
function spanOpen(color, size) {
    var c = /^#[0-9a-f]{6}$/.test(color) ? color : '', z = size && ownKey(SIZE_EM, size) ? SIZE_EM[size] : '';
    return c || z ? '<span style="' + (c ? 'color:' + c : '') + (c && z ? ';' : '') + (z ? 'font-size:' + z : '') + '">' : '';
}
function styledInline(runs, base, put, tags) {
    var B = tags ? ['<b>', '</b>'] : ['**', '**'], I = tags ? ['<i>', '</i>'] : ['*', '*'];
    var body = runs.map(function(r, k) {
        var x = put(r.t, k === 0), sp = r.color && r.color !== base.color ? spanOpen(r.color, '') : '';
        if (r.i && !base.i) x = I[0] + x + I[1];
        if (r.b && !base.b) x = B[0] + x + B[1];
        return sp ? sp + x + '</span>' : x;
    }).join('');
    if (base.i) body = I[0] + body + I[1];
    if (base.b) body = B[0] + body + B[1];
    var around = spanOpen(base.color, base.size);
    return around ? around + body + '</span>' : body;
}
// A plain field with its format as the dialect's inline text — or null when it has none, or when it could not be read back (the caller then
// writes the field exactly as before). o.put(text, first): a run's text escaped for its place; o.read(inline): how that place is read
// (fieldOf by default); o.tags: only <b> / <i> (the line is itself bold or italic syntax); o.lines: the place takes a text with line breaks.
function fieldMd(text, fmt, o) {
    var t = text == null ? '' : String(text), f = t ? cleanFmt(fmt, t) : undefined;
    if (!f || (!o.lines && /[\r\n]/.test(t))) return null;
    var runs = runsOf(t, f), base = wholeLook(f, runs), read = o.read || fieldOf;
    var out = styledInline(runs, base, o.put, true), back = read(out);
    if (!back || !back.fmt || (back.text === t && looksOf(back.text, back.fmt) !== looksOf(t, f))) return null;
    if (!o.tags) {   // Markdown's own marks where they read back as the tags do
        var marked = styledInline(runs, base, o.put, false), mb = marked === out ? null : read(marked);
        if (mb && mb.text === back.text && JSON.stringify(mb.fmt) === JSON.stringify(back.fmt)) out = marked;
    }
    return out;
}
var IN_LINE = { put: function(x, first) { return first ? mdEscapeText(x) : mdEscapeMarks(x); } };   // a heading, a scene node's tag and must-resolve, a caption
var IN_BOLD = { put: IN_LINE.put, tags: true, read: function(s) { var m = /^\s*(\*\*|__)(.+?)\1\s*$/.exec('**' + s + '**'); return m ? fieldOf(m[2]) : null; } };   // a table's title: its line is bold syntax
var IN_ITALIC = { put: IN_LINE.put, tags: true, read: function(s) { var m = /^\s*(\*|_)([^*_]+)\1\s*$/.exec('*' + s + '*'); return m ? fieldOf(m[2]) : null; } };   // the subtitle: its line is italic syntax
var IN_CELL = { lines: true, put: function(x) { return mdEscapeMarks(String(x).replace(/\r?\n/g, ' ')).replace(/\|/g, '\\|'); }, read: function(s) { var c = splitRow('| ' + s + ' |'); return c.length === 1 ? fieldOf(c[0]) : null; } };
// a scene node's title: read after "### Scene:", whose own trailing space takes any the title begins with
var IN_SCENE = { put: IN_LINE.put, read: function(s) { var f = fieldOf(s), t = fieldOf('Scene: ' + s).text.replace(/^scene:\s*/i, ''); return f.text === t ? f : { text: t }; } };
function fieldText(b, k, o) { return fieldMd(b[k], fieldFmt(b, k), o) || mdEscapeText(b[k] || ''); }

/* ---------- the simple mermaid subset → a native flowchart block ---------- */
var SHAPES = { '[': 'rect', '(': 'rounded', '([': 'pill', '{': 'diamond', '{{': 'hex' };
var NODE_RE = /^([A-Za-z0-9_]+)(?:(\(\[|\[|\(|\{\{|\{)\s*("?)([^\]\)\}"]*?)\3\s*(\]\)|\]|\)|\}\}|\}))?(?::::([A-Za-z]+))?/;
var EDGE_RE = /^(-->|-\.->|==>)(?:\|("?)([^|]*?)\2\|)?|^--\s+([^-]+?)\s+-->|^-\.\s+([^.]+?)\s+\.->/;
function flowchartFromMermaid(src) {
    var lines = String(src || '').replace(/\r/g, '').split('\n').map(function(l) { return l.replace(/%%.*$/, '').trim(); }).filter(Boolean);
    var head = /^(flowchart|graph)\s*(TD|TB|LR|RL|BT)?\s*;?$/i.exec(lines[0] || ''); if (!head) return null;
    var dir = head[2] ? head[2].toUpperCase() : 'TD'; if (dir === 'TB') dir = 'TD';
    var nodes = {}, order = [], edges = [];
    function defNode(tok) {
        var m = NODE_RE.exec(tok); if (!m) return null;
        var id = m[1];
        if (!nodes[id]) { nodes[id] = { id: id, text: id, shape: 'rect', color: 'neutral' }; order.push(id); }
        var nd = nodes[id];
        if (m[2]) { if (SHAPES[m[2]] === undefined || !closes(m[2], m[5])) return null; var lf = mmRead(m[4]); if (lf) { nd.text = lf.text; nd.fmt = lf.fmt; } else { nd.text = m[4].replace(/<br\s*\/?>/gi, '\n').replace(/#quot;/g, '"').replace(/#35;/g, '#'); delete nd.fmt; } nd.shape = SHAPES[m[2]]; }
        if (m[6]) { if (!/^(gold|blue|green|red|violet|neutral)$/.test(m[6])) return null; nd.color = m[6]; }
        return { id: id, len: m[0].length };
    }
    function closes(open, close) { return { '[': ']', '(': ')', '([': '])', '{': '}', '{{': '}}' }[open] === close; }
    for (var i = 1; i < lines.length; i++) {
        var l = lines[i].replace(/;$/, '').trim();
        var d = /^direction\s+(TD|TB|LR|RL|BT)$/i.exec(l); if (d) { dir = d[1].toUpperCase() === 'TB' ? 'TD' : d[1].toUpperCase(); continue; }
        if (/^(classDef|class|style|linkStyle|click|subgraph|end|href|callback)\b/i.test(l) || l.indexOf('&') >= 0) return null;   // beyond the subset: a mermaid block instead
        var pos = 0, cur = defNode(l); if (!cur) return null;
        pos = cur.len;
        while (pos < l.length) {
            var restL = l.slice(pos).replace(/^\s+/, ''); pos = l.length - restL.length;
            if (!restL) break;
            var e = EDGE_RE.exec(restL); if (!e) return null;
            pos += e[0].length;
            var afterE = l.slice(pos).replace(/^\s+/, ''); pos = l.length - afterE.length;
            var nxt = defNode(afterE); if (!nxt) return null;
            pos += nxt.len;
            var ef = e[3] ? mmRead(e[3]) : null, edge = { from: cur.id, to: nxt.id, text: ef ? ef.text : (e[3] || e[4] || e[5] || '').trim(), style: e[1] === '-.->' || e[5] !== undefined ? 'dotted' : 'solid' };
            if (ef) edge.fmt = ef.fmt;
            edges.push(edge);
            cur = nxt;
        }
    }
    if (!order.length) return null;
    return { type: 'flowchart', dir: dir, space: 'normal', zoom: 1, nodes: order.map(function(id) { return nodes[id]; }), edges: edges };
}
// A label with a format (text style): written in the tags mermaid keeps in a label and a planner's flowchart already draws with — <b>, <i>,
// <font color=rrggbb> (no quote and no # may stand in a mermaid string), <big> / <small> around everything for the field's size — the
// look of the whole label once around everything, the parts inside it. Read back (mmRead) only when writing the format read gives the very
// label again: any other label is its text, tags and all, exactly as before.
var MM_SIZE = { small: ['<small>', '</small>'], large: ['<big>', '</big>'], larger: ['<big><big>', '</big></big>'], huge: ['<big><big><big>', '</big></big></big>'] };
var MM_STEPS = { 'small': 'small', 'big': 'large', 'big big': 'larger', 'big big big': 'huge' };
function mmStyled(text, fmt) {
    var t = text == null ? '' : String(text), f = t ? cleanFmt(fmt, t) : undefined;
    if (!f) return null;
    var runs = runsOf(t, f), base = wholeLook(f, runs);
    var font = function(c, x) { return /^#[0-9a-f]{6}$/.test(c) ? '<font color=' + c.slice(1) + '>' + x + '</font>' : x; };
    var body = runs.map(function(r) {
        var x = mmQuote(r.t).slice(1, -1);
        if (r.i && !base.i) x = '<i>' + x + '</i>';
        if (r.b && !base.b) x = '<b>' + x + '</b>';
        return r.color && r.color !== base.color ? font(r.color, x) : x;
    }).join('');
    if (base.i) body = '<i>' + body + '</i>';
    if (base.b) body = '<b>' + body + '</b>';
    if (base.color) body = font(base.color, body);
    return base.size && ownKey(MM_SIZE, base.size) ? MM_SIZE[base.size][0] + body + MM_SIZE[base.size][1] : body;
}
function mmRead(raw) {
    raw = String(raw == null ? '' : raw);
    if (raw.indexOf('<') < 0) return null;
    var w = lookWalk(), text = '', open = [], at = 0, re = /<(\/?)(b|i|font|big|small|br)(\s[^<>]*|\/)?>/gi, m;
    var put = function(s) { if (!s) return; var t = s.replace(/#quot;/g, '"').replace(/#35;/g, '#'); text += t; w.text(t.length); };
    while ((m = re.exec(raw))) {
        var tag = m[2].toLowerCase(), attr = m[3] || '', look;
        if (tag === 'br') { if (m[1] || !/^\s*\/?$/.test(attr)) continue; put(raw.slice(at, m.index)); text += '\n'; w.text(1); at = re.lastIndex; continue; }
        if (m[1]) { if (attr || open[open.length - 1] !== tag) return null; put(raw.slice(at, m.index)); open.pop(); w.close(); at = re.lastIndex; continue; }
        if (tag === 'font') { var c = /^ color=([0-9a-f]{6})$/.exec(attr); if (!c) continue; look = { color: '#' + c[1] }; }
        else if (attr) continue;   // not a tag of ours: it stays text
        else look = tag === 'b' ? { b: true } : tag === 'i' ? { i: true } : { step: tag };
        put(raw.slice(at, m.index)); open.push(tag); w.open(look); at = re.lastIndex;
    }
    put(raw.slice(at));
    if (open.length) return null;
    var steps = w.els().filter(function(el) { return el.look.step; }), full = w.wraps().filter(function(el) { return el.look.step; }), size = '';
    if (steps.length !== full.length) return null;   // a size on part of a label is not a field's
    if (full.length) { var steps2 = full.map(function(el) { return el.look.step; }).join(' '); if (!ownKey(MM_STEPS, steps2)) return null; size = MM_STEPS[steps2]; }   // <small>, or one to three <big>
    var fmt = w.fmt(text, size);
    return fmt && mmStyled(text, fmt) === raw ? { text: text, fmt: fmt } : null;
}
// What the export writes for a styled label — only when it reads back to the very text and looks; else null (the label is then written as before)
function mmLabel(text, fmt) {
    var s = mmStyled(text, fmt); if (s == null) return null;
    var back = mmRead(s);
    return back && back.text === String(text) && looksOf(back.text, back.fmt) === looksOf(back.text, fmt) ? '"' + s + '"' : null;
}
function mmQuote(t) { return '"' + String(t || '').replace(/"/g, '#quot;').replace(/#/g, function(c, k, s) { return s.slice(k, k + 6) === '#quot;' ? c : '#35;'; }).replace(/\r?\n/g, '<br>') + '"'; }
function flowchartToMermaid(b) {
    var L = ['flowchart ' + (/^(TD|LR|BT|RL)$/.test(b.dir || '') ? b.dir : 'TD')];
    (b.nodes || []).forEach(function(nd) {
        var o = { rect: '[', rounded: '(', pill: '([', diamond: '{', hex: '{{' }[nd.shape] || '[', c = { '[': ']', '(': ')', '([': '])', '{': '}', '{{': '}}' }[o];
        L.push(String(nd.id || 'n').replace(/[^A-Za-z0-9_]/g, '_') + o + (mmLabel(nd.text, ownKey(nd, 'fmt') ? nd.fmt : undefined) || mmQuote(nd.text || nd.id)) + c + (nd.color && nd.color !== 'neutral' ? ':::' + nd.color : ''));
    });
    (b.edges || []).forEach(function(e) { if (!e.from || !e.to) return; L.push(String(e.from).replace(/[^A-Za-z0-9_]/g, '_') + ' ' + (e.style === 'dotted' ? '-.->' : '-->') + (e.text ? '|' + (mmLabel(e.text, ownKey(e, 'fmt') ? e.fmt : undefined) || mmQuote(e.text)) + '|' : '') + ' ' + String(e.to).replace(/[^A-Za-z0-9_]/g, '_')); });
    return L.join('\n');
}

/* ---------- Markdown → blocks ---------- */
// A span that holds nothing — one a file opens on a line of its own, leaves open, or closes on a later line: a span lives inside one
// paragraph — is dropped, the white space it held kept (so it leaves no empty paragraph behind and no empty tag in a block)
function dropEmptySpans(html) { var prev; do { prev = html; html = html.replace(/<span[^>]*>(\s*)<\/span>/g, '$1'); } while (html !== prev); return html; }
function isBlockStart(line, next) {
    return /^(```+|~~~+)/.test(line) || /^:::\s*(lede|oneline|flare|callout)\s*$/i.test(line) || /^#{1,6}\s/.test(line) || /^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line) || /^>/.test(line) || LIST_RE.test(line) || (/\|/.test(line) && isTableSep(next)) || /^!\[[^\]]*\](\([^)]*\)|\[[^\]]*\])\s*(\{[^{}]*\})?\s*$/.test(line);
}
// opts.kind: 'doc' (default) | 'planner'; opts.items: the campaign's items (a planner's "Map: title / room" lines resolve against them)
function markdownToBlocks(text, opts) {
    opts = opts || {};
    var kind = opts.kind === 'planner' ? 'planner' : 'doc', items = opts.items || {};
    var notes = [], meta = {}, blocks = [], images = [], run = [], scene = null, pendingTitle = null, sawH1 = false, h1Block = null;
    var ctx = { inlineImages: [] };
    text = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (text.length > LIMITS.text) { text = text.slice(0, LIMITS.text); notes.push('The file is longer than 2 MB; the rest was left out.'); }
    var fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
    if (fm) {
        fm[1].split('\n').forEach(function(l) {
            var m = /^([A-Za-z_]+)\s*:\s*(.*)$/.exec(l); if (!m) return;
            var k = m[1].toLowerCase(), v = m[2].replace(/(\s{2,}|\t)#.*$/, '').trim().replace(/^(["'])(.*)\1$/, '$2');   // "value   # a comment" as the template shows
            var qm = /^"(?:[^"\\]|\\.)*"/.exec(m[2].trim()); if (qm) { try { v = String(JSON.parse(qm[0])); } catch (e) {} }   // F2a: a double-quoted value as yamlStr writes it (\" \u003c \r …)
            if (k === 'title' || k === 'subtitle') meta[k] = v;
            else if (k === 'status') { if (kind === 'planner' && /^(next|played|skipped)$/.test(v)) meta.status = v; else notes.push('Front matter "status" is for planners; ignored.'); }
            else if (k === 'players') { if (kind === 'doc') meta.players = !/^(false|no|off|0)$/i.test(v); else notes.push('Front matter "players" is for handbook pages; ignored.'); }
            else notes.push('Front matter "' + k + '" ignored.');
        });
        text = text.slice(fm[0].length);
    }
    var refs = {};
    text = text.replace(/^\[([^\]]+)\]:\s*(<[^>]*>|\S+)(?:\s+"[^"]*")?\s*$/gm, function(m, label, dest) { refs[label.toLowerCase()] = dest.replace(/^<|>$/g, ''); return ''; });
    var lines = text.split('\n');

    function push(b) { b.id = uid(); blocks.push(b); return b; }
    // What a file's inline HTML becomes in a text block: the page sanitiser's — its allow-list of tags, and the one span form (a colour, a size step) an export writes
    function tidy(html) { return dropEmptySpans(sanitizeHtml(html)).replace(/<p>\s*<\/p>/g, ''); }   // an HTML block inside a paragraph leaves empty pairs behind
    function flushRun() { if (!run.length) return; var html = tidy(run.join('')); run = []; if (html.replace(/<[^>]+>/g, '').trim() || /<pre>/.test(html)) push({ type: 'text', content: html }); }
    function flushInlineImages() { var list = ctx.inlineImages; ctx.inlineImages = []; list.forEach(function(im) { addImage(im.caption, im.dest, im.ref, im.attrs, true); }); }
    function addImage(caption, dest, ref, attrs, wasInline) {
        var target = dest != null ? dest : (ref != null ? refs[String(ref).toLowerCase()] : undefined);
        var capF = fieldOf(caption || ''); caption = capF.text;
        if (target === undefined) { flushRun(); setFmt(push({ type: 'image', src: '', caption: caption }), 'caption', capF.fmt); notes.push('Picture "' + (caption || ref || '?') + '": no source given — an empty picture block was made.'); return; }
        target = String(target).trim();
        if (/^https?:\/\//i.test(target)) { run.push('<p><a href="' + esc(target) + '">' + esc(caption || target) + '</a></p>'); notes.push('Online picture kept as a link: ' + target.slice(0, 80)); return; }
        flushRun();
        var b = { type: 'image', src: '', caption: caption };
        setFmt(b, 'caption', capF.fmt);
        var lay = layoutFromAttrs(attrs);
        if (kind === 'doc') { if (lay) b.layout = lay; }
        else if (lay) { if (lay.width) b.width = lay.width; if (lay.float === 'left' || lay.float === 'right') b.align = lay.float; }
        push(b);
        images.push({ index: blocks.length - 1, kind: /^data:/i.test(target) ? 'data' : 'file', value: target, name: /^data:/i.test(target) ? '' : target.split(/[\\/]/).pop() });
        if (wasInline) notes.push('Picture "' + (caption || b.src || target.slice(0, 40)) + '" was inside a paragraph; it became its own block after it.');
    }
    function handleFence(info, body) {
        if (info === 'mermaid') { flushRun(); push({ type: 'diagram', content: kind === 'planner' ? body.replace(/</g, '&lt;').replace(/>/g, '&gt;') : body }); return; }
        if (info === 'flowchart' || info === 'graph') { var fc = flowchartFromMermaid(body); flushRun(); if (fc) { push(fc); } else { push({ type: 'diagram', content: kind === 'planner' ? body.replace(/</g, '&lt;').replace(/>/g, '&gt;') : body }); notes.push('A flowchart fence went beyond the simple subset; it was kept as a mermaid diagram.'); } return; }
        if (info === 'html') { run.push('<pre><code>' + esc(body) + '</code></pre>'); notes.push('An html fence was kept as code, not as page markup.'); return; }
        run.push('<pre><code>' + esc(body) + '</code></pre>');
    }
    // fm: the formats read with the texts — { title, cols: [fmt…], rows: [[fmt…]…] }, each undefined where there is none
    function pushTable(cols, rows, title, fm) {
        fm = fm || {};
        var cf = fm.cols || [], rf = fm.rows || [];
        if (cols.length > LIMITS.cols) { notes.push('Table "' + (title || cols[0] || '') + '": ' + cols.length + ' columns cut to ' + LIMITS.cols + '.'); cols = cols.slice(0, LIMITS.cols); }
        var objRows = rows.map(function(r, ri) {
            var o = {}, fo = {}, one = rf[ri] || [];
            cols.forEach(function(c, k) { o['col' + (k + 1)] = r[k] === undefined ? '' : r[k]; if (one[k] && r[k] !== undefined) fo['col' + (k + 1)] = one[k]; });
            if (Object.keys(fo).length) o.fmt = fo;
            return o;
        });
        var colFmt = cols.map(function(c, k) { return cf[k] || null; });   // parallel to cols: null for a plain head, no trailing nulls
        while (colFmt.length && !colFmt[colFmt.length - 1]) colFmt.pop();
        if (scene && kind === 'planner') { scene.cols = cols; scene.rows = objRows; if (colFmt.length) scene.colFmt = colFmt; else delete scene.colFmt; scene = null; return; }
        flushRun();
        var tb = kind === 'planner' ? push({ type: 'node', mode: 'table', title: title || '', cols: cols, rows: objRows }) : push({ type: 'table', title: title || '', cols: cols, rows: objRows });
        if (colFmt.length) tb.colFmt = colFmt;
        if (title) setFmt(tb, 'title', fm.title);
    }
    var i = 0;
    while (i < lines.length) {
        var line = lines[i], next = lines[i + 1];
        var f = /^(```+|~~~+)\s*([A-Za-z0-9_-]*)/.exec(line);
        if (f) {
            var fenceCh = f[1][0], fenceLen = f[1].length, info = f[2].toLowerCase(), body = []; i++;
            while (i < lines.length && !(new RegExp('^' + (fenceCh === '`' ? '`' : '~') + '{' + fenceLen + ',}\\s*$').test(lines[i].trim()))) { body.push(lines[i]); i++; }
            i++; scene = null; handleFence(info, body.join('\n')); continue;
        }
        var cf = /^:::\s*(lede|oneline|flare|callout)\s*$/i.exec(line);
        if (cf) { var cb = []; i++; while (i < lines.length && !/^:::\s*$/.test(lines[i])) { cb.push(lines[i]); i++; } i++; flushRun(); scene = null; push({ type: cf[1].toLowerCase(), content: dropEmptySpans(sanitizeHtml(paraHtml(cb.filter(function(x) { return x.trim(); }), ctx))) }); flushInlineImages(); continue; }
        if (!line.trim()) { i++; continue; }
        var h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
        if (h) {
            var level = h[1].length, ht = splitAttrTail(h[2]), hf = fieldOf(ht.text), title = hf.text;
            flushRun(); scene = null; pendingTitle = null;
            if (level === 1 && !sawH1) {
                sawH1 = true; h1Block = push({ type: 'h1', title: title, sub: meta.subtitle || '' }); setFmt(h1Block, 'title', hf.fmt);
                if (!meta.title) meta.title = title;
                var sm = /^\s*(\*|_)([^*_]+)\1\s*$/.exec(lines[i + 1] || '');   // an italic-only line right under the title is the subtitle (front matter wins when both are given)
                if (sm) { var sf = fieldOf(sm[2]); if (!h1Block.sub) h1Block.sub = sf.text; if (sf.text === h1Block.sub) setFmt(h1Block, 'sub', sf.fmt); i++; }   // its format, where the line is the subtitle
            } else if (level <= 2) {
                var h2 = push({ type: 'h2', title: title }); setFmt(h2, 'title', hf.fmt);
                if (kind === 'doc' && ht.attrs && ht.attrs.cols) { var cn = parseInt(ht.attrs.cols, 10); if (cn >= 1 && cn <= 3) h2.cols = cn; else notes.push('Section "' + title + '": columns must be 1–3.'); }
            } else if (level === 3 && kind === 'planner' && /^scene:\s*/i.test(title)) {
                var sceneRaw = /^scene:\s*/i.exec(ht.text), sceneF = sceneRaw ? fieldOf(ht.text.slice(sceneRaw[0].length)) : null, sceneT = title.replace(/^scene:\s*/i, '');
                scene = push({ type: 'node', title: sceneT, tag: '', must: '', cols: [], rows: [] });
                if (sceneF && sceneF.text === sceneT) setFmt(scene, 'title', sceneF.fmt);   // the title after "Scene:", its format with it
            } else if (level === 3 && kind === 'doc') {
                setFmt(push({ type: 'h3', title: title }), 'title', hf.fmt);
            } else {
                run.push('<p><b>' + esc(title) + '</b></p>');
                if (level === 3) notes.push('Heading "' + title + '" became a bold lead line (a planner has no sub-heading block; use "### Scene:" for a scene node).');
            }
            i++; continue;
        }
        if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushRun(); scene = null; if (kind === 'doc') push({ type: 'rule' }); i++; continue; }
        if (/^>/.test(line)) {
            var qb = [lines[i].replace(/^>\s?/, '')]; i++;
            while (i < lines.length && /^>/.test(lines[i]) && !/^>\s*\[!(lede|oneline|flare|callout)\]/i.test(lines[i])) { qb.push(lines[i].replace(/^>\s?/, '')); i++; }   // a new [!type] line starts its own block
            var qt = 'callout', tm = /^\[!(lede|oneline|flare|callout)\]\s*/i.exec(qb[0] || '');
            if (tm) { qt = tm[1].toLowerCase(); qb[0] = qb[0].slice(tm[0].length); }
            if (qb.some(function(x) { return /^>/.test(x); })) notes.push('A nested quote was flattened.');
            flushRun(); scene = null; push({ type: qt, content: dropEmptySpans(sanitizeHtml(paraHtml(qb.map(function(x) { return x.replace(/^>\s?/, ''); }).filter(function(x) { return x.trim(); }), ctx))) }); flushInlineImages(); continue;
        }
        if (/\|/.test(line) && isTableSep(next)) {
            var textOf = function(c) { return c.text; }, fmtOf = function(c) { return c.fmt; };
            var hc = splitRow(line).map(fieldOf), cols = hc.map(textOf), rows = [], rfm = []; i += 2;
            while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) { var rc = splitRow(lines[i]).map(fieldOf); rows.push(rc.map(textOf)); rfm.push(rc.map(fmtOf)); i++; }
            var tt = pendingTitle; pendingTitle = null; pushTable(cols, rows, tt ? tt.text : tt, { title: tt ? tt.fmt : undefined, cols: hc.map(fmtOf), rows: rfm }); continue;
        }
        var imL = /^!\[([^\]]*)\]\(([^)]*)\)\s*(\{[^{}]*\})?\s*$/.exec(line) || /^!\[([^\]]*)\]\[([^\]]*)\]\s*(\{[^{}]*\})?\s*$/.exec(line);
        if (imL) {
            var byRef = line.indexOf('](') < 0, dest = byRef ? null : imL[2].replace(/\s+"[^"]*"$/, '').replace(/^<|>$/g, ''), ref = byRef ? (imL[2] || imL[1]) : null;
            var at = imL[3] ? parseAttrs(imL[3]) : null; if (imL[3] && !at) notes.push('Picture attributes "' + imL[3] + '" not understood (use width, float, dx, dy, span).');
            scene = null; addImage(imL[1], dest, ref, at, false); i++; continue;
        }
        if (LIST_RE.test(line)) {
            var lb = []; while (i < lines.length && lines[i].trim() && (LIST_RE.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && !isBlockStart(lines[i], lines[i + 1])))) { lb.push(lines[i]); i++; }
            scene = null; run.push(listHtml(lb, ctx)); flushInlineImages(); continue;
        }
        // scene-node field lines (planner) right under "### Scene:"
        if (scene && kind === 'planner') {
            var fld = /^\*\*(tag|must resolve|must):?\*\*:?\s*(.*)$/i.exec(line) || /^(map)\s*:\s*(.*)$/i.exec(line);
            if (fld) {
                var key = fld[1].toLowerCase(), vf = fieldOf(fld[2]), val = vf.text;
                if (key === 'tag') { scene.tag = val; setFmt(scene, 'tag', vf.fmt); }
                else if (key === 'map') {
                    var parts = val.split('/').map(function(x) { return x.trim(); }), mapT = parts[0].toLowerCase(), roomT = (parts[1] || '').toLowerCase();
                    var mp = Object.values(items).find(function(it) { return it && it.type === 'map' && String((it.meta && it.meta.title) || '').toLowerCase() === mapT; });
                    if (mp) { scene.linkMapId = mp.id; if (roomT) { var rm = (mp.rooms || []).find(function(r) { return String(r.name || '').toLowerCase() === roomT; }); if (rm) scene.linkRoomId = rm.id; else notes.push('Scene "' + scene.title + '": room "' + parts[1] + '" not found on ' + mp.meta.title + '.'); } }
                    else notes.push('Scene "' + scene.title + '": map "' + parts[0] + '" not found in this campaign.');
                } else { scene.must = val; setFmt(scene, 'must', vf.fmt); }
                i++; continue;
            }
        }
        // paragraph: consecutive plain lines
        var pb = [];
        while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) { pb.push(lines[i]); i++; }
        if (!pb.length) { i++; continue; }
        var boldOnly = pb.length === 1 && /^\s*(\*\*|__)(.+?)\1\s*$/.exec(pb[0]);
        var nextNonBlank = i; while (nextNonBlank < lines.length && !lines[nextNonBlank].trim()) nextNonBlank++;
        if (boldOnly && nextNonBlank < lines.length && /\|/.test(lines[nextNonBlank]) && isTableSep(lines[nextNonBlank + 1])) { pendingTitle = fieldOf(boldOnly[2]); continue; }   // the table's title
        scene = null;
        run.push('<p>' + paraHtml(pb, ctx) + '</p>');
        flushInlineImages();
    }
    flushRun();
    if (blocks.length > LIMITS.blocks) { notes.push('Only the first ' + LIMITS.blocks + ' blocks were kept (' + blocks.length + ' in the file).'); blocks = blocks.slice(0, LIMITS.blocks); images = images.filter(function(im) { return im.index < LIMITS.blocks; }); }
    return { kind: kind, blocks: blocks, notes: notes, meta: meta, images: images };
}

/* ---------- blocks → Markdown ---------- */
// A text run as plain text in the dialect: its marks escaped (and an & that would read as an entity), and — where the run starts a line — a
// line start that would open a block: a heading (#, ##…), a list or a rule (-, +, ---), a table row (|), a prose fence or a table's
// separator (:), a number list (1. → 1\.). Each reads back exactly as written (inline() unescapes \ before # + - . ) |, and &#58; is a colon;
// a backslash before a digit or a colon it would keep)
function mdEscapeMarks(s) { return String(s).replace(/([\\*_`~\[\]<>])/g, '\\$1').replace(/&(?=#?[A-Za-z0-9]+;)/g, '&amp;'); }
function mdEscapeLineStart(s) { return String(s).replace(/^(\s*)([#+\-|])/, '$1\\$2').replace(/^(\s*):/, '$1&#58;').replace(/^(\s*)(\d+)([.)])(\s|$)/, '$1$2\\$3$4'); }
function mdEscapeText(s) { return mdEscapeLineStart(mdEscapeMarks(s)); }
// A text block's colour / size span as the sanitiser's one form, written anew from its two values ('' for any other span)
function spanTag(attrs) {
    var m = /^\s*style="(?:color:(#[0-9a-f]{6}))?;?(?:font-size:([0-9.]+em))?"\s*$/.exec(attrs || ''), size = m && m[2] && ownKey(SIZE_OF, m[2]) ? m[2] : '';
    return m && (m[1] || size) ? '<span style="' + (m[1] ? 'color:' + m[1] : '') + (m[1] && size ? ';' : '') + (size ? 'font-size:' + size : '') + '">' : '';
}
// Sanitized prose HTML back to the dialect (p, br, b/strong, i/em, u, s, ul/ol/li, code, pre, a, and the colour / size span as itself).
// opts.tags === true: bold and italic as <b> / <i> instead of the marks (proseMd: where the marks would not read back).
function htmlToMarkdown(html, opts) {
    var tags = !!opts && opts.tags === true, out = '', hrefs = [], lists = [], inPre = false, inCode = false, re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi, m;
    // open colour / size spans: written when text follows, closed before a block ends and opened again after it (a span never crosses a paragraph in the file)
    var spans = [];
    var hold = function() { for (var k = spans.length - 1; k >= 0; k--) if (spans[k].live) { out += '</span>'; spans[k].live = false; } };
    // bold / italic: the mark — or, with opts.tags, the tag; each closes the way it was opened (inside code it is the mark, as ever)
    var asTag = [], bi = function(close, t, mark) { if (!tags) return mark; if (!close) { asTag.push(!inCode); return inCode ? mark : '<' + t + '>'; } return asTag.pop() === true ? '</' + t + '>' : mark; };
    var resume = function() { for (var k = 0; k < spans.length; k++) if (!spans[k].live && spans[k].tag) { out += spans[k].tag; spans[k].live = true; } };
    while ((m = re.exec(html))) {
        if (m[4] !== undefined) {   // F2a: a code span is read back raw (no escapes in it); a line start only where the run starts a line
            var t = unent(m[4]); if (inPre) { out += t; continue; }
            var tx = t.replace(/\s+/g, ' '), atStart = !out || /\n$/.test(out);
            if (spans.length && /\S/.test(tx)) resume();
            out += inCode ? tx : atStart ? mdEscapeText(tx) : mdEscapeMarks(tx); continue;
        }
        var close = !!m[1], tag = m[2].toLowerCase();
        if (inPre) { if (tag === 'pre' && close) { inPre = false; out += '\n```\n\n'; } continue; }
        if (tag === 'span') { if (!close) spans.push({ tag: inCode ? '' : spanTag(m[3]), live: false }); else { var sp = spans.pop(); if (sp && sp.live) out += '</span>'; } continue; }
        if (spans.length) { if (tag === 'p' || tag === 'ul' || tag === 'ol' || tag === 'li' || tag === 'pre') hold(); else if (!close && tag !== 'br') resume(); }
        switch (tag) {
            case 'p': if (close) out += '\n\n'; break;
            case 'br': out += '  \n'; break;
            case 'b': case 'strong': out += bi(close, 'b', '**'); break;
            case 'i': case 'em': out += bi(close, 'i', '*'); break;
            case 's': case 'strike': out += '~~'; break;
            case 'u': out += close ? '</u>' : '<u>'; break;
            case 'code': out += '`'; inCode = !close; break;
            case 'pre': inPre = true; out += '\n```\n'; break;
            case 'ul': case 'ol': if (!close) { lists.push({ t: tag, n: 0 }); if (lists.length === 1 && out && !/\n$/.test(out)) out += '\n'; } else { lists.pop(); if (!lists.length) out += '\n'; } break;
            case 'li': if (!close) { var L = lists[lists.length - 1] || { t: 'ul', n: 0 }; L.n++; if (out && !/\n$/.test(out)) out += '\n'; out += new Array(Math.max(0, lists.length - 1) + 1).join('  ') + (L.t === 'ol' ? L.n + '. ' : '- '); } else if (!/\n$/.test(out)) out += '\n'; break;
            case 'a': if (!close) { var hm = /href="([^"]*)"/.exec(m[3]); hrefs.push(hm ? unent(hm[1]) : ''); out += '['; } else out += '](' + (hrefs.pop() || '') + ')'; break;
        }
    }
    // a <code> inside <pre> was swallowed with the pre; stray backticks from <code> inside pre never happen
    return out.replace(/`\n```/g, '\n```').replace(/[ \t]+\n/g, function(x) { return /  \n$/.test(x) ? '  \n' : '\n'; }).replace(/\n{3,}/g, '\n\n').trim();
}
function quoteLines(md) { return md.split('\n').map(function(l) { return '> ' + l; }).join('\n'); }
// A text block's Markdown as its lines in the file; a prose block's (lede, oneline, flare, callout) as its quote
function proseLines(type, md) { if (type === 'text') return [md]; var l = md.split('\n'); return ['> [!' + type + '] ' + l[0]].concat(l.slice(1).map(function(x) { return '> ' + x; })); }
// A text or prose block as the dialect's Markdown. Where it holds a colour / size span, Markdown's own bold and italic marks are used only
// where the block reads back as it does with the tags: a mark beside a span's tag can pair up wrongly on the way back in
// (*<span …>**word**</span>* is read as an italic that ends at the first of the two stars). Else its bold and italic are written as
// <b> / <i>, which the importer hands to the sanitiser as they are. A block with no span is written exactly as it always was.
function proseMd(html, type, kind) {
    var md = htmlToMarkdown(html);
    if (html.indexOf('<span') < 0) return md;
    var tagged = htmlToMarkdown(html, { tags: true });
    if (tagged === md) return md;
    var read = function(x) { return JSON.stringify(markdownToBlocks(proseLines(type, x).join('\n'), { kind: kind }).blocks.map(function(b) { return [b.type, b.content]; })); };
    return read(md) === read(tagged) ? md : tagged;
}
function cellText(s) { return String(s == null ? '' : s).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim(); }
function yamlStr(s) { s = String(s == null ? '' : s); return /[:#\[\]{}"'<>&\u0000-\u001f\u007f]|^\s|\s$/.test(s) ? JSON.stringify(s).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026') : s; }   // F2a: a control character (a CR would end the front matter early), and markup, always quoted and escaped
function layoutTail(l, forPage) {
    if (!l || typeof l !== 'object') return '';
    var parts = [];
    if (l.width && l.width !== 100) parts.push('width=' + l.width);
    if (l.float && l.float !== 'none') parts.push('float=' + l.float);
    if (l.dx) parts.push('dx=' + l.dx);
    if (l.dy) parts.push('dy=' + l.dy);
    if (l.span) parts.push('span');
    return parts.length ? '{' + parts.join(' ') + '}' : '';
}
function rowCells(r, cols) {
    if (Array.isArray(r)) return r;
    if (!r || typeof r !== 'object') return [];
    var a = []; for (var i = 1; i <= Math.max(cols.length, 1); i++) a.push(r['col' + i] == null ? '' : r['col' + i]);
    return a;
}
// b: the block the table is, for its formats (a title's, a head's, a cell's); with none, every cell is written as it always was
function tableMd(title, cols, rows, b) {
    var heads = Array.isArray(cols) && cols.length ? cols : ['Item', 'Detail', 'Notes'];
    cols = heads.map(function(c, k) { return (b && fieldMd(c, colFmtOf(b, k), IN_CELL)) || cellText(c); });
    var L = [];
    if (title) L.push('**' + ((b && fieldMd(title, fieldFmt(b, 'title'), IN_BOLD)) || mdEscapeText(title)) + '**');
    L.push('| ' + cols.join(' | ') + ' |');
    L.push('|' + cols.map(function() { return '---'; }).join('|') + '|');
    (rows || []).forEach(function(r, ri) { var c = rowCells(r, cols); L.push('| ' + cols.map(function(x, k) { return (b && fieldMd(c[k], cellFmtOf(b, ri, k), IN_CELL)) || cellText(c[k]); }).join(' | ') + ' |'); });
    return L.join('\n');
}
// opts.items: the campaign's items (a scene node's map link is written as "Map: title / room");
// returns { text, images: [{ path, name }] } — the caller bundles the pictures under images/<itemId>/<name>
function docToMarkdown(item, opts) {
    opts = opts || {};
    var items = opts.items || {}, kind = item.type === 'doc' ? 'doc' : 'planner', meta = item.meta || {};
    var L = [], images = [], used = {};
    var h1 = (item.blocks || []).find(function(b) { return b && b.type === 'h1'; });
    var fm = ['title: ' + yamlStr(meta.title || (h1 && h1.title) || 'Untitled')];
    if (h1 && h1.sub) fm.push('subtitle: ' + yamlStr(h1.sub));
    if (kind === 'planner' && meta.status) fm.push('status: ' + meta.status);
    if (kind === 'doc' && meta.players === false) fm.push('players: false');
    L.push('---'); L.push.apply(L, fm); L.push('---', '');
    var sawH1 = false;
    (item.blocks || []).forEach(function(b) {
        if (!b || typeof b !== 'object') return;
        switch (b.type) {
            case 'h1':
                if (sawH1) { L.push('## ' + fieldText(b, 'title', IN_LINE), ''); break; }
                sawH1 = true; L.push('# ' + fieldText(b, 'title', IN_LINE)); if (b.sub) L.push('*' + fieldText(b, 'sub', IN_ITALIC) + '*'); L.push(''); break;
            case 'h2': L.push('## ' + fieldText(b, 'title', IN_LINE) + (kind === 'doc' && b.cols > 1 ? ' {cols=' + Math.min(3, b.cols) + '}' : ''), ''); break;
            case 'h3': L.push('### ' + fieldText(b, 'title', IN_LINE), ''); break;
            case 'text': L.push(proseMd(sanitizeHtml(b.content || ''), 'text', kind), ''); break;
            case 'lede': case 'oneline': case 'flare': case 'callout': L.push.apply(L, proseLines(b.type, proseMd(sanitizeHtml(b.content || ''), b.type, kind))); L.push(''); break;
            case 'image': {
                var ref = '';
                if (b.src && b.src.indexOf('/saves/images/') === 0) {
                    var name = b.src.split('/').pop().replace(/^[a-z0-9]{8}_/, ''), base = name, k = 2;
                    while (used[name] && used[name] !== b.src) { name = base.replace(/(\.[^.]*)?$/, '-' + (k++) + '$1'); }
                    used[name] = b.src;
                    if (!images.some(function(im) { return im.path === b.src; })) images.push({ path: b.src, name: name });
                    ref = 'images/' + item.id + '/' + name;
                }
                var lay = kind === 'doc' ? b.layout : (b.width && b.width !== 100 || (b.align && b.align !== 'center') ? { width: b.width, float: b.align === 'left' || b.align === 'right' ? b.align : 'none' } : null);
                L.push('![' + fieldText(b, 'caption', IN_LINE) + '](' + ref + ')' + layoutTail(lay), ''); break;
            }
            case 'table': L.push(tableMd(b.title, b.cols, b.rows, b), ''); break;
            case 'node':
                if (b.mode === 'table') { L.push(tableMd(b.title, b.cols, b.rows, b), ''); break; }
                L.push('### Scene: ' + fieldText(b, 'title', IN_SCENE));
                if (b.tag) L.push('**Tag:** ' + fieldText(b, 'tag', IN_LINE));
                if (b.must) L.push('**Must resolve:** ' + fieldText(b, 'must', IN_LINE));
                if (b.linkMapId && items[b.linkMapId]) { var mp = items[b.linkMapId], rm = b.linkRoomId && (mp.rooms || []).find(function(r) { return r.id === b.linkRoomId; }); L.push('Map: ' + ((mp.meta && mp.meta.title) || mp.id) + (rm ? ' / ' + (rm.name || rm.id) : '')); }
                if ((b.cols && b.cols.length) || (b.rows && b.rows.length)) L.push(tableMd('', b.cols && b.cols.length ? b.cols : ['Action', 'Why', 'Cost', 'Returns via'], b.rows, b));
                L.push(''); break;
            case 'rule': L.push('---', ''); break;
            case 'diagram': L.push('```mermaid', unent(String(b.content || '')).replace(/```/g, '` ` `'), '```', ''); break;
            case 'flowchart': L.push('```flowchart', flowchartToMermaid(b), '```', ''); break;
            case 'raw': L.push('```html', String(b.content || '').replace(/```/g, '` ` `'), '```', ''); break;
        }
    });
    return { text: L.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n', images: images };
}

/* ---------- a zip dropped on Import: a Markdown bundle, or not ---------- */
// entries: [{ name, data }] as zip.js reads them. A bundle has a .md at the root or one folder down
// (Finder and Explorer wrap folders), ignoring __MACOSX and dotfiles. Returns { md, base, files } or null.
function detectBundle(entries) {
    var list = (entries || []).filter(function(en) { return en && typeof en.name === 'string' && !/^__MACOSX\//.test(en.name) && !/(^|\/)\./.test(en.name); });
    var mds = list.filter(function(en) { return /\.(md|markdown)$/i.test(en.name) && en.name.split('/').length <= 2; });
    if (!mds.length) return null;
    mds.sort(function(a, b) { return a.name.split('/').length - b.name.split('/').length || a.name.localeCompare(b.name); });
    var md = mds[0], base = md.name.indexOf('/') >= 0 ? md.name.slice(0, md.name.lastIndexOf('/') + 1) : '';
    return { md: md, base: base, files: list };
}

var TEMPLATE = [
'---',
'title: House rules              # the page title (else the first heading, else the file name)',
'subtitle: What the table agreed on',
'players: true                   # pages: true (default) or false for GM only; planners use status: next|played|skipped',
'---',
'',
'# House rules',
'*An italic-only line right under the title is the subtitle when the front matter has none*',
'',
'> [!lede] The lead paragraph: a short, large introduction.',
'',
'## At the table {cols=2}',
'',
'Plain paragraphs are text. **Bold**, *italic*, ~~strike~~, <u>underline</u>, `code`,',
'[links](https://example.com), bullets and numbers all survive:',
'',
'- a bullet',
'  - nested two spaces in',
'1. a number',
'',
'### Sub-heading',
'',
'> A plain quote becomes a callout (gold edge).',
'> [!flare] A violet aside.',
'> [!oneline] A boxed one-line summary.',
'',
'**Travel pace**',
'| Pace   | Per hour | Effect                   |',
'|--------|----------|--------------------------|',
'| Fast   | 4 miles  | -5 to passive Perception |',
'| Normal | 3 miles  | none                     |',
'',
'![The basement](images/map_basement.jpg){width=33 float=right}',
'',
'A picture floats left or right with a width from 25 to 100 (per cent of the column), a nudge in',
'pixels (dx, dy) and span to take every column of a section. Put the .md and its pictures in one',
'zip (or pick them together) and the relative paths resolve; data: pictures from Google Docs work as',
'they are; https: pictures are kept as links.',
'',
'```flowchart',
'flowchart LR',
'a["Roll initiative"]:::gold --> b{"Surprise?"}',
'b -->|"yes"| c["Surprised side skips"]',
'```',
'',
'```mermaid',
'sequenceDiagram',
'  GM->>Players: Roll for initiative',
'```',
'',
'---',
'',
'A rule line (---) draws a horizontal line on a page and ends the current text block in a planner.',
'Planners only: "### Scene: The docks" opens a scene node, with **Tag:**, **Must resolve:** and',
'Map: <map title> / <room name> lines under it and a table of routes after those.',
''
].join('\n');

var API = { VERSION: VERSION, LIMITS: LIMITS, PLANNER_BLOCKS: PLANNER_BLOCKS.slice(), DOC_BLOCKS: DOC_BLOCKS.slice(), markdownToBlocks: markdownToBlocks, docToMarkdown: docToMarkdown, htmlToMarkdown: htmlToMarkdown, fmtFromInline: fmtFromInline, flowchartFromMermaid: flowchartFromMermaid, flowchartToMermaid: flowchartToMermaid, parseAttrs: parseAttrs, detectBundle: detectBundle, TEMPLATE: TEMPLATE };
if (typeof window !== 'undefined') window.wpDocMd = API;
export { VERSION, LIMITS, PLANNER_BLOCKS, markdownToBlocks, docToMarkdown, htmlToMarkdown, fmtFromInline, mdEscapeText, mdEscapeMarks, yamlStr, flowchartFromMermaid, flowchartToMermaid, parseAttrs, detectBundle, TEMPLATE };

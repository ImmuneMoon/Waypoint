/* Markdown in and out for planners and handbook pages (1.5.0, handbook slice 3) — the pure half.
   markdownToBlocks(text, opts) turns a Markdown file into planner / page blocks plus notes and a list
   of the pictures it referenced (the caller uploads those and fills in the URLs); docToMarkdown(item)
   writes a planner or page back in the same dialect so the guide is proven by the round trip;
   flowchartFromMermaid reads the simple mermaid subset into the builder's native flowchart block.
   No DOM, no state: docrender.js's sanitizer is the only import, so tools/doccheck.js runs this
   under Node. The dialog and the entry points live in docimport.js.

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
     link). Raw HTML from a file is never a raw block: unknown tags are dropped, their text kept. */
'use strict';
import { sanitizeHtml, DOC_BLOCKS } from './docrender.js';

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
            m = new RegExp('^(\\' + ch + '\\' + ch + ')(?=\\S)([\\s\\S]+?\\S)\\1').exec(rest);
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
function plainText(md) { return unent(inline(md, { inlineImages: [] }).replace(/<[^>]+>/g, '')); }   // cells and titles are plain text in the editor's inputs

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
        if (m[2]) { if (SHAPES[m[2]] === undefined || !closes(m[2], m[5])) return null; nd.text = m[4].replace(/<br\s*\/?>/gi, '\n').replace(/#quot;/g, '"').replace(/#35;/g, '#'); nd.shape = SHAPES[m[2]]; }
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
            edges.push({ from: cur.id, to: nxt.id, text: (e[3] || e[4] || e[5] || '').trim(), style: e[1] === '-.->' || e[5] !== undefined ? 'dotted' : 'solid' });
            cur = nxt;
        }
    }
    if (!order.length) return null;
    return { type: 'flowchart', dir: dir, space: 'normal', zoom: 1, nodes: order.map(function(id) { return nodes[id]; }), edges: edges };
}
function mmQuote(t) { return '"' + String(t || '').replace(/"/g, '#quot;').replace(/#/g, function(c, k, s) { return s.slice(k, k + 6) === '#quot;' ? c : '#35;'; }).replace(/\r?\n/g, '<br>') + '"'; }
function flowchartToMermaid(b) {
    var L = ['flowchart ' + (/^(TD|LR|BT|RL)$/.test(b.dir || '') ? b.dir : 'TD')];
    (b.nodes || []).forEach(function(nd) {
        var o = { rect: '[', rounded: '(', pill: '([', diamond: '{', hex: '{{' }[nd.shape] || '[', c = { '[': ']', '(': ')', '([': '])', '{': '}', '{{': '}}' }[o];
        L.push(String(nd.id || 'n').replace(/[^A-Za-z0-9_]/g, '_') + o + mmQuote(nd.text || nd.id) + c + (nd.color && nd.color !== 'neutral' ? ':::' + nd.color : ''));
    });
    (b.edges || []).forEach(function(e) { if (!e.from || !e.to) return; L.push(String(e.from).replace(/[^A-Za-z0-9_]/g, '_') + ' ' + (e.style === 'dotted' ? '-.->' : '-->') + (e.text ? '|' + mmQuote(e.text) + '|' : '') + ' ' + String(e.to).replace(/[^A-Za-z0-9_]/g, '_')); });
    return L.join('\n');
}

/* ---------- Markdown → blocks ---------- */
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
    function tidy(html) { return sanitizeHtml(html).replace(/<p>\s*<\/p>/g, ''); }   // an HTML block inside a paragraph leaves empty pairs behind
    function flushRun() { if (!run.length) return; var html = tidy(run.join('')); run = []; if (html.replace(/<[^>]+>/g, '').trim() || /<pre>/.test(html)) push({ type: 'text', content: html }); }
    function flushInlineImages() { var list = ctx.inlineImages; ctx.inlineImages = []; list.forEach(function(im) { addImage(im.caption, im.dest, im.ref, im.attrs, true); }); }
    function addImage(caption, dest, ref, attrs, wasInline) {
        var target = dest != null ? dest : (ref != null ? refs[String(ref).toLowerCase()] : undefined);
        caption = plainText(caption || '');
        if (target === undefined) { flushRun(); push({ type: 'image', src: '', caption: caption }); notes.push('Picture "' + (caption || ref || '?') + '": no source given — an empty picture block was made.'); return; }
        target = String(target).trim();
        if (/^https?:\/\//i.test(target)) { run.push('<p><a href="' + esc(target) + '">' + esc(caption || target) + '</a></p>'); notes.push('Online picture kept as a link: ' + target.slice(0, 80)); return; }
        flushRun();
        var b = { type: 'image', src: '', caption: caption };
        var lay = layoutFromAttrs(attrs);
        if (kind === 'doc') { if (lay) b.layout = lay; }
        else if (lay) { if (lay.width) b.width = lay.width; if (lay.float === 'left' || lay.float === 'right') b.align = lay.float; }
        push(b);
        images.push({ index: blocks.length - 1, kind: /^data:/i.test(target) ? 'data' : 'file', value: target, name: /^data:/i.test(target) ? '' : target.split(/[\\/]/).pop() });
        if (wasInline) notes.push('Picture "' + (caption || b.src || target.slice(0, 40)) + '" was inside a paragraph; it became its own block after it.');
    }
    function handleFence(info, body) {
        if (info === 'mermaid') { flushRun(); push({ type: 'diagram', content: kind === 'planner' ? body.replace(/</g, '&lt;').replace(/>/g, '&gt;') : body }); notes.push('A diagram draws with an internet connection; its source is kept either way.'); return; }
        if (info === 'flowchart' || info === 'graph') { var fc = flowchartFromMermaid(body); flushRun(); if (fc) { push(fc); } else { push({ type: 'diagram', content: kind === 'planner' ? body.replace(/</g, '&lt;').replace(/>/g, '&gt;') : body }); notes.push('A flowchart fence went beyond the simple subset; it was kept as a mermaid diagram.'); } return; }
        if (info === 'html') { run.push('<pre><code>' + esc(body) + '</code></pre>'); notes.push('An html fence was kept as code, not as page markup.'); return; }
        run.push('<pre><code>' + esc(body) + '</code></pre>');
    }
    function pushTable(cols, rows, title) {
        if (cols.length > LIMITS.cols) { notes.push('Table "' + (title || cols[0] || '') + '": ' + cols.length + ' columns cut to ' + LIMITS.cols + '.'); cols = cols.slice(0, LIMITS.cols); }
        var objRows = rows.map(function(r) { var o = {}; cols.forEach(function(c, k) { o['col' + (k + 1)] = r[k] === undefined ? '' : r[k]; }); return o; });
        if (scene && kind === 'planner') { scene.cols = cols; scene.rows = objRows; scene = null; return; }
        flushRun();
        if (kind === 'planner') push({ type: 'node', mode: 'table', title: title || '', cols: cols, rows: objRows });
        else push({ type: 'table', title: title || '', cols: cols, rows: objRows });
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
        if (cf) { var cb = []; i++; while (i < lines.length && !/^:::\s*$/.test(lines[i])) { cb.push(lines[i]); i++; } i++; flushRun(); scene = null; push({ type: cf[1].toLowerCase(), content: sanitizeHtml(paraHtml(cb.filter(function(x) { return x.trim(); }), ctx)) }); flushInlineImages(); continue; }
        if (!line.trim()) { i++; continue; }
        var h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
        if (h) {
            var level = h[1].length, ht = splitAttrTail(h[2]), title = plainText(ht.text);
            flushRun(); scene = null; pendingTitle = null;
            if (level === 1 && !sawH1) {
                sawH1 = true; h1Block = push({ type: 'h1', title: title, sub: meta.subtitle || '' });
                if (!meta.title) meta.title = title;
                var sm = /^\s*(\*|_)([^*_]+)\1\s*$/.exec(lines[i + 1] || '');   // an italic-only line right under the title is the subtitle (front matter wins when both are given)
                if (sm) { if (!h1Block.sub) h1Block.sub = plainText(sm[2]); i++; }
            } else if (level <= 2) {
                var h2 = push({ type: 'h2', title: title });
                if (kind === 'doc' && ht.attrs && ht.attrs.cols) { var cn = parseInt(ht.attrs.cols, 10); if (cn >= 1 && cn <= 3) h2.cols = cn; else notes.push('Section "' + title + '": columns must be 1–3.'); }
            } else if (level === 3 && kind === 'planner' && /^scene:\s*/i.test(title)) {
                scene = push({ type: 'node', title: title.replace(/^scene:\s*/i, ''), tag: '', must: '', cols: [], rows: [] });
            } else if (level === 3 && kind === 'doc') {
                push({ type: 'h3', title: title });
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
            flushRun(); scene = null; push({ type: qt, content: sanitizeHtml(paraHtml(qb.map(function(x) { return x.replace(/^>\s?/, ''); }).filter(function(x) { return x.trim(); }), ctx)) }); flushInlineImages(); continue;
        }
        if (/\|/.test(line) && isTableSep(next)) {
            var cols = splitRow(line).map(plainText), rows = []; i += 2;
            while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) { rows.push(splitRow(lines[i]).map(plainText)); i++; }
            var tt = pendingTitle; pendingTitle = null; pushTable(cols, rows, tt); continue;
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
                var key = fld[1].toLowerCase(), val = plainText(fld[2]);
                if (key === 'tag') scene.tag = val;
                else if (key === 'map') {
                    var parts = val.split('/').map(function(x) { return x.trim(); }), mapT = parts[0].toLowerCase(), roomT = (parts[1] || '').toLowerCase();
                    var mp = Object.values(items).find(function(it) { return it && it.type === 'map' && String((it.meta && it.meta.title) || '').toLowerCase() === mapT; });
                    if (mp) { scene.linkMapId = mp.id; if (roomT) { var rm = (mp.rooms || []).find(function(r) { return String(r.name || '').toLowerCase() === roomT; }); if (rm) scene.linkRoomId = rm.id; else notes.push('Scene "' + scene.title + '": room "' + parts[1] + '" not found on ' + mp.meta.title + '.'); } }
                    else notes.push('Scene "' + scene.title + '": map "' + parts[0] + '" not found in this campaign.');
                } else scene.must = val;
                i++; continue;
            }
        }
        // paragraph: consecutive plain lines
        var pb = [];
        while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) { pb.push(lines[i]); i++; }
        if (!pb.length) { i++; continue; }
        var boldOnly = pb.length === 1 && /^\s*(\*\*|__)(.+?)\1\s*$/.exec(pb[0]);
        var nextNonBlank = i; while (nextNonBlank < lines.length && !lines[nextNonBlank].trim()) nextNonBlank++;
        if (boldOnly && nextNonBlank < lines.length && /\|/.test(lines[nextNonBlank]) && isTableSep(lines[nextNonBlank + 1])) { pendingTitle = plainText(boldOnly[2]); continue; }   // the table's title
        scene = null;
        run.push('<p>' + paraHtml(pb, ctx) + '</p>');
        flushInlineImages();
    }
    flushRun();
    if (blocks.length > LIMITS.blocks) { notes.push('Only the first ' + LIMITS.blocks + ' blocks were kept (' + blocks.length + ' in the file).'); blocks = blocks.slice(0, LIMITS.blocks); images = images.filter(function(im) { return im.index < LIMITS.blocks; }); }
    return { kind: kind, blocks: blocks, notes: notes, meta: meta, images: images };
}

/* ---------- blocks → Markdown ---------- */
function mdEscapeText(s) { return String(s).replace(/([\\*_`~\[\]<>])/g, '\\$1').replace(/^(\s*)([#>+\-]|\d+[.)])(\s)/, '$1\\$2$3'); }
// Sanitized prose HTML back to the dialect (p, br, b/strong, i/em, u, s, ul/ol/li, code, pre, a)
function htmlToMarkdown(html) {
    var out = '', hrefs = [], lists = [], inPre = false, re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi, m;
    while ((m = re.exec(html))) {
        if (m[4] !== undefined) { var t = unent(m[4]); out += inPre ? t : mdEscapeText(t.replace(/\s+/g, ' ')); continue; }
        var close = !!m[1], tag = m[2].toLowerCase();
        if (inPre) { if (tag === 'pre' && close) { inPre = false; out += '\n```\n\n'; } continue; }
        switch (tag) {
            case 'p': if (close) out += '\n\n'; break;
            case 'br': out += '  \n'; break;
            case 'b': case 'strong': out += '**'; break;
            case 'i': case 'em': out += '*'; break;
            case 's': case 'strike': out += '~~'; break;
            case 'u': out += close ? '</u>' : '<u>'; break;
            case 'code': out += '`'; break;
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
function cellText(s) { return String(s == null ? '' : s).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim(); }
function yamlStr(s) { s = String(s == null ? '' : s); return /[:#\[\]{}"'\n]|^\s|\s$/.test(s) ? JSON.stringify(s) : s; }
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
function tableMd(title, cols, rows) {
    cols = (Array.isArray(cols) && cols.length ? cols : ['Item', 'Detail', 'Notes']).map(cellText);
    var L = [];
    if (title) L.push('**' + mdEscapeText(title) + '**');
    L.push('| ' + cols.join(' | ') + ' |');
    L.push('|' + cols.map(function() { return '---'; }).join('|') + '|');
    (rows || []).forEach(function(r) { var c = rowCells(r, cols); L.push('| ' + cols.map(function(x, k) { return cellText(c[k]); }).join(' | ') + ' |'); });
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
                if (sawH1) { L.push('## ' + mdEscapeText(b.title || ''), ''); break; }
                sawH1 = true; L.push('# ' + mdEscapeText(b.title || '')); if (b.sub) L.push('*' + mdEscapeText(b.sub) + '*'); L.push(''); break;
            case 'h2': L.push('## ' + mdEscapeText(b.title || '') + (kind === 'doc' && b.cols > 1 ? ' {cols=' + Math.min(3, b.cols) + '}' : ''), ''); break;
            case 'h3': L.push('### ' + mdEscapeText(b.title || ''), ''); break;
            case 'text': L.push(htmlToMarkdown(sanitizeHtml(b.content || '')), ''); break;
            case 'lede': case 'oneline': case 'flare': case 'callout': {
                var md = htmlToMarkdown(sanitizeHtml(b.content || ''));
                L.push('> [!' + b.type + '] ' + md.split('\n')[0]); md.split('\n').slice(1).forEach(function(x) { L.push('> ' + x); }); L.push(''); break;
            }
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
                L.push('![' + mdEscapeText(b.caption || '') + '](' + ref + ')' + layoutTail(lay), ''); break;
            }
            case 'table': L.push(tableMd(b.title, b.cols, b.rows), ''); break;
            case 'node':
                if (b.mode === 'table') { L.push(tableMd(b.title, b.cols, b.rows), ''); break; }
                L.push('### Scene: ' + mdEscapeText(b.title || ''));
                if (b.tag) L.push('**Tag:** ' + mdEscapeText(b.tag));
                if (b.must) L.push('**Must resolve:** ' + mdEscapeText(b.must));
                if (b.linkMapId && items[b.linkMapId]) { var mp = items[b.linkMapId], rm = b.linkRoomId && (mp.rooms || []).find(function(r) { return r.id === b.linkRoomId; }); L.push('Map: ' + ((mp.meta && mp.meta.title) || mp.id) + (rm ? ' / ' + (rm.name || rm.id) : '')); }
                if ((b.cols && b.cols.length) || (b.rows && b.rows.length)) L.push(tableMd('', b.cols && b.cols.length ? b.cols : ['Action', 'Why', 'Cost', 'Returns via'], b.rows));
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

var API = { VERSION: VERSION, LIMITS: LIMITS, PLANNER_BLOCKS: PLANNER_BLOCKS.slice(), DOC_BLOCKS: DOC_BLOCKS.slice(), markdownToBlocks: markdownToBlocks, docToMarkdown: docToMarkdown, htmlToMarkdown: htmlToMarkdown, flowchartFromMermaid: flowchartFromMermaid, flowchartToMermaid: flowchartToMermaid, parseAttrs: parseAttrs, detectBundle: detectBundle, TEMPLATE: TEMPLATE };
if (typeof window !== 'undefined') window.wpDocMd = API;
export { VERSION, LIMITS, PLANNER_BLOCKS, markdownToBlocks, docToMarkdown, htmlToMarkdown, flowchartFromMermaid, flowchartToMermaid, parseAttrs, detectBundle, TEMPLATE };

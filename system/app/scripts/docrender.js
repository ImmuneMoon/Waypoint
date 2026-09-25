/* Handbook pages: the sanitizer, the wire cleaner, the renderer and the flowchart compiler (1.5.0).
   A pure leaf module — no imports, no DOM, no state — so net.js can clean a page for the wire, the
   GM's preview, the player's reader and the HTML export can render one through the same code, and
   tools/doccheck.js can run the whole thing under Node. Published as window.wpDocRender when a
   window exists (the same guard formula.js uses).

   The contract every caller relies on:
     sanitizeHtml(html)      the ONLY way rich-text content reaches a screen. Allow-list of tags,
                             one attribute (href on a, http(s) only), text re-escaped, output
                             re-serialised from a token list (never a slice of the input) and balanced.
     cleanDoc(doc, opts)     the wire sanitizer (host) and the client-side normaliser (keepHidden):
                             a new object with only the known fields, every string capped, every
                             number validated; null for a GM-only page unless opts.keepHidden.
     renderDoc(doc, opts)    the page as HTML built from escaped text and sanitized content only.
     proseHtml(content, t)   the planner's line-break rule, shared so pages and planners read alike.
     compileFlowchart(b)     the builder block → mermaid source (moved here from planner.js).
   Sizes: LIMITS below. Block ids: every block carries one ('b_…'); cleanDoc re-mints duplicates. */
'use strict';

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
   (href on a) rebuilt from its decoded value when it is an http(s) URL. Nothing from a tag token
   is ever copied through, which is what makes <scr<script>ipt>, <!-->, unclosed quotes and tags
   inside <code> inert: they are either a recognised tag (emitted clean) or text (escaped). Tags are
   balanced on output with a stack: stray closers are dropped, open tags are closed at the end. */
var ALLOWED = { p: 1, br: 1, b: 1, strong: 1, i: 1, em: 1, u: 1, s: 1, strike: 1, ul: 1, ol: 1, li: 1, code: 1, pre: 1, a: 1 };
var VOID = { br: 1 };
var DROP_CONTENT = { script: 1, style: 1, template: 1, iframe: 1, object: 1, embed: 1, svg: 1, math: 1, noscript: 1, textarea: 1, select: 1, option: 1, button: 1, input: 1, form: 1, frame: 1, frameset: 1, title: 1, head: 1 };
var AS_P = { div: 1, blockquote: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, section: 1, article: 1 };   // block containers the RTE or a paste can produce: paragraphs, so line breaks survive
var LIST = { ul: 1, ol: 1 };

function tokenize(html) {
    var out = [], i = 0, n = html.length;
    while (i < n) {
        var lt = html.indexOf('<', i);
        if (lt < 0) { out.push({ text: html.slice(i) }); break; }
        if (lt > i) out.push({ text: html.slice(i, lt) });
        // comment / CDATA / processing instruction / doctype: dropped whole
        if (html.charAt(lt + 1) === '!' || html.charAt(lt + 1) === '?') {
            var endC;
            if (html.slice(lt, lt + 4) === '<!--') { endC = html.indexOf('-->', lt + 4); endC = endC < 0 ? n : endC + 3; }
            else { endC = html.indexOf('>', lt); endC = endC < 0 ? n : endC + 1; }
            i = endC; continue;
        }
        // a tag: name, then attributes (quotes respected: an unclosed quote runs to the end of the input)
        var m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, lt + 40));
        if (!m) { out.push({ text: '<' }); i = lt + 1; continue; }
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
function sanitizeHtml(html) {
    var s = String(html == null ? '' : html);
    if (s.length > LIMITS.html) s = s.slice(0, LIMITS.html);
    var toks = tokenize(s), out = '', stack = [], skip = null, skipDepth = 0;
    function openTag(name, extra) { stack.push(name); out += '<' + name + (extra || '') + '>'; }
    function closeTo(name) {   // close everything above the nearest open `name`; drop the closer when it is not open
        var at = stack.lastIndexOf(name); if (at < 0) return;
        while (stack.length > at) out += '</' + stack.pop() + '>';
    }
    function inList() { return stack.some(function(t) { return LIST[t]; }); }
    for (var k = 0; k < toks.length; k++) {
        var t = toks[k];
        if (skip) {   // inside a dropped-content element: swallow until its closer
            if (t.tag === skip) { if (t.close) { if (--skipDepth <= 0) { skip = null; skipDepth = 0; } } else if (!t.self) skipDepth++; }
            continue;
        }
        if (t.text !== undefined) { out += esc(decodeEntities(t.text)); continue; }
        var name = t.tag;
        if (DROP_CONTENT[name]) { if (!t.close && !t.self) { skip = name; skipDepth = 1; } continue; }
        if (AS_P[name]) name = 'p';
        if (!ALLOWED[name]) continue;                       // unknown tag: dropped, its text kept (span, font, img, table cells…)
        if (t.close) { if (!VOID[name]) closeTo(name); continue; }
        if (VOID[name]) { out += '<br>'; continue; }
        if (name === 'li' && !inList()) name = 'p';         // a list item outside a list reads as a paragraph
        if (name === 'p' && stack.indexOf('p') >= 0) closeTo('p');   // paragraphs never nest (the browser would not either)
        if (name === 'a') {
            var href = safeHref(attrValue(t.attrs, 'href'));
            if (!href) continue;                            // a link without a safe target is just its text
            if (stack.indexOf('a') >= 0) closeTo('a');
            openTag('a', ' href="' + esc(href) + '" target="_blank" rel="noopener noreferrer"');
            continue;
        }
        openTag(name);
        if (t.self) closeTo(name);
    }
    while (stack.length) out += '</' + stack.pop() + '>';
    return out;
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
function mmText(t) { return '"' + String(t || '').replace(/#/g, '#35;').replace(/"/g, '#quot;').replace(/\r?\n/g, '<br>') + '"'; }
function mmId(t) { var v = String(t || '').trim().replace(/[^A-Za-z0-9_]/g, '_'); return v || 'n'; }
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
    (Array.isArray(b.nodes) ? b.nodes : []).forEach(function(n) {
        if (!n || typeof n !== 'object') return;
        var id = mmId(n.id || ('n' + Math.random().toString(36).substr(2, 5)));
        var txt = mmText(n.text || 'Node');
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
        if (e.text) line += '|' + mmText(e.text) + '|';
        m += mmId(e.from) + ' ' + line + ' ' + mmId(e.to) + '\n';
    });
    return m;
}
// Mermaid's link and callback directives never depend on its security mode: gone from anything a
// player receives. Applied to diagram sources (cleanDoc) and again when rendering (renderDoc).
function stripMermaidLinks(src) {
    return String(src || '').split(/\r?\n/).filter(function(line) { return !/^\s*(click|callback|href|linkStyle)\b/i.test(line); }).join('\n');
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
var LAYOUT_OK = { image: 1, callout: 1, flare: 1, table: 1, diagram: 1, flowchart: 1 };
var NO_FLOAT_IN_COLS = { callout: 1, flare: 1 };
function cleanBlock(b, used, ctx) {
    if (!b || typeof b !== 'object' || DOC_BLOCKS.indexOf(b.type) < 0) return null;
    var o = { type: b.type };
    o.id = (typeof b.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(b.id) && !used[b.id]) ? b.id : newId(used);
    used[o.id] = 1;
    switch (b.type) {
        case 'h1': o.title = str(b.title, LIMITS.title); o.sub = str(b.sub, LIMITS.title); break;
        case 'h2': o.title = str(b.title, LIMITS.title); o.cols = Math.round(num(b.cols, 1, 3, 1)); ctx.cols = o.cols; break;
        case 'h3': o.title = str(b.title, LIMITS.title); break;
        case 'rule': break;
        case 'image': o.src = safeSrc(b.src); o.caption = str(b.caption, LIMITS.caption); o.alt = str(b.alt, LIMITS.caption); break;
        case 'table':
            o.title = str(b.title, LIMITS.title);
            o.cols = (Array.isArray(b.cols) ? b.cols : []).slice(0, LIMITS.cols).map(function(c) { return str(c, LIMITS.title); });
            o.rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, LIMITS.rows).map(function(r) { return rowCells(r).map(function(c) { return str(c, LIMITS.cell); }); });
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
                return { id: str(n.id, 40), text: str(n.text, LIMITS.cell), shape: /^(rect|rounded|pill|diamond|hex)$/.test(n.shape || '') ? n.shape : 'rect', color: /^(gold|blue|green|red|violet|neutral)$/.test(n.color || '') ? n.color : 'neutral' };
            });
            o.edges = (Array.isArray(b.edges) ? b.edges : []).slice(0, LIMITS.edges).map(function(e) {
                e = e && typeof e === 'object' ? e : {};
                return { from: str(e.from, 40), to: str(e.to, 40), text: str(e.text, LIMITS.caption), style: e.style === 'dotted' ? 'dotted' : 'solid' };
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
            case 'h1': blk += '<h1>' + esc(b.title) + (b.sub ? '<span class="sub">' + esc(b.sub) + '</span>' : '') + '</h1>'; break;
            case 'h2': blk += '<h2>' + esc(b.title) + '</h2>'; break;
            case 'h3': blk += '<h3 class="doc-h3">' + esc(b.title) + '</h3>'; break;
            case 'rule': blk += '<hr class="doc-rule">'; break;
            case 'text': blk += proseHtml(b.content, 'text'); break;
            case 'lede': blk += '<p class="lede">' + proseHtml(b.content) + '</p>'; break;
            case 'oneline': blk += '<div class="oneline">' + proseHtml(b.content) + '</div>'; break;
            case 'callout': blk += '<div' + layoutAttrs(b, 'callout') + '>' + proseHtml(b.content) + '</div>'; break;
            case 'flare': blk += '<div' + layoutAttrs(b, 'flare') + '>' + proseHtml(b.content) + '</div>'; break;
            case 'image': {
                var p = safeSrc(b.src);
                if (p) blk += '<figure' + layoutAttrs(b, 'doc-img planner-img') + '><img src="' + esc(srcOf(p)) + '" data-path="' + esc(p) + '" alt="' + esc(b.alt || b.caption || '') + '">' + (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') + '</figure>';
                else blk += '<figure' + layoutAttrs(b, 'doc-img planner-img doc-img-empty') + '><div class="doc-noimg">No picture yet</div>' + (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') + '</figure>';
                break;
            }
            case 'table': {
                var tcols = Array.isArray(b.cols) ? b.cols.slice(0, LIMITS.cols) : [], rows = (Array.isArray(b.rows) ? b.rows : []).map(rowCells);
                var ncol = Math.max(tcols.length, rows.reduce(function(m, r) { return Math.max(m, r.length); }, 0), 1);
                blk += '<div' + layoutAttrs(b, 'node plain-table doc-tablewrap') + '>';
                if (b.title) blk += '<h3>' + esc(b.title) + '</h3>';
                blk += '<table class="doc-table">';
                if (tcols.length) { blk += '<thead><tr>'; for (var c = 0; c < ncol; c++) blk += '<th>' + esc(tcols[c] || '') + '</th>'; blk += '</tr></thead>'; }
                blk += '<tbody>';
                rows.forEach(function(r) { blk += '<tr>'; for (var c2 = 0; c2 < ncol; c2++) blk += '<td>' + esc(r[c2] || '') + '</td>'; blk += '</tr>'; });
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
                blk += '<div class="' + fcls + '" data-fc="' + i + '" style="' + boxStyle + '"><pre class="mermaid">' + esc(stripMermaidLinks(compileFlowchart(b))) + '</pre></div>';
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

var API = { VERSION: VERSION, LIMITS: LIMITS, DOC_BLOCKS: DOC_BLOCKS.slice(), sanitizeHtml: sanitizeHtml, cleanDoc: cleanDoc, renderDoc: renderDoc, proseHtml: proseHtml, nl: nl, compileFlowchart: compileFlowchart, stripMermaidLinks: stripMermaidLinks, esc: esc, cleanDocStyle: cleanDocStyle, mergeDocStyle: mergeDocStyle, docStyleCss: docStyleCss, docBgImage: docBgImage, DOC_FONTS: DOC_FONTS };
if (typeof window !== 'undefined') window.wpDocRender = API;
export { VERSION, LIMITS, DOC_BLOCKS, sanitizeHtml, cleanDoc, renderDoc, proseHtml, nl, compileFlowchart, stripMermaidLinks, cleanDocStyle, mergeDocStyle, docStyleCss, docBgImage, DOC_FONTS };

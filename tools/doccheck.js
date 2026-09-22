/* Offline harness for the handbook renderer and sanitizer (system/app/scripts/docrender.js).
   Loads the module under Node — once with no window (the guard), once with a stub window (the
   publication) — and drives sanitizeHtml, cleanDoc, renderDoc, proseHtml and compileFlowchart
   through the corpus HANDBOOK_PLAN.md §11 asks for. Every output is also checked for balance and
   for the absence of anything that could run. Usage: node tools/doccheck.js */
'use strict';
const path = require('path');
const mod = path.join(__dirname, '..', 'system', 'app', 'scripts', 'docrender.js');
const url = 'file:///' + path.resolve(mod).replace(/\\/g, '/');

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } }

// Balanced-output checker: every opening tag has its closer, in order; only allowed names appear;
// no attribute but the link trio; nothing that looks like an event handler or a script.
const ALLOWED = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'ul', 'ol', 'li', 'code', 'pre', 'a']);
function inert(html) {
    const stack = [];
    const re = /<(\/?)([a-z0-9]+)([^>]*)>/g; let m;
    while ((m = re.exec(html))) {
        const name = m[2], attrs = m[3];
        if (!ALLOWED.has(name)) return 'tag ' + name;
        if (m[1]) { if (stack.pop() !== name) return 'unbalanced ' + name; continue; }
        if (name === 'br') { if (attrs) return 'br attrs'; continue; }
        if (name === 'a') { if (!/^ href="https?:\/\/[^"]*" target="_blank" rel="noopener noreferrer"$/.test(attrs)) return 'a attrs ' + attrs; }
        else if (attrs) return 'attrs on ' + name + ': ' + attrs;
        stack.push(name);
    }
    if (stack.length) return 'open at end: ' + stack.join(',');
    if (/<[^a-z\/]/i.test(html)) return 'stray <';
    if (/on[a-z]+\s*=|javascript:|<script|<img|<svg|<iframe|<style|<object|<embed/i.test(html)) return 'dangerous text';
    return null;
}

(async () => {
    /* ---- the guard: loads with no window ---- */
    let D = null, loadErr = null;
    try { D = await import(url); } catch (e) { loadErr = e; }
    check('module loads in Node with no window (the guard)', !!D && !loadErr, loadErr && loadErr.message);
    if (!D) { console.log('\n' + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const { sanitizeHtml, cleanDoc, renderDoc, proseHtml, nl, compileFlowchart, stripMermaidLinks, LIMITS, DOC_BLOCKS, cleanDocStyle, docStyleCss, DOC_FONTS } = D;

    /* ---- sanitizeHtml corpus ---- */
    const S = [
        ['script dropped with content', '<p>a</p><script>alert(1)</script><p>b</p>', h => h === '<p>a</p><p>b</p>'],
        ['img onerror dropped (tag gone, nothing kept)', 'x<img src=x onerror=alert(1)>y', h => h === 'xy'],
        ['javascript: link becomes text', '<a href="javascript:alert(1)">go</a>', h => h === 'go'],
        ['JAVASCRIPT: (case) becomes text', '<a href="JAVASCRIPT:alert(1)">go</a>', h => h === 'go'],
        ['entity-encoded javascript: becomes text', '<a href="&#106;avascript:alert(1)">go</a>', h => h === 'go'],
        ['data: link becomes text', '<a href="data:text/html;base64,PHNjcmlwdD4=">go</a>', h => h === 'go'],
        ['protocol-relative link becomes text', '<a href="//evil.example/x">go</a>', h => h === 'go'],
        ['tab-split java\\tscript: becomes text', '<a href="java\tscript:alert(1)">go</a>', h => h === 'go'],
        ['https link kept with target/rel', '<a href=" https://example.com/a?b=1&c=2 ">go</a>', h => h === '<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">go</a>'],
        ['http link kept', '<a href="http://example.com">go</a>', h => h === '<a href="http://example.com" target="_blank" rel="noopener noreferrer">go</a>'],
        ['single-quoted href with a double quote inside is attribute-escaped', "<a href='https://e.com/x\"y'>go</a>", h => h === '<a href="https://e.com/x&quot;y" target="_blank" rel="noopener noreferrer">go</a>'],
        ['link with a space inside the URL refused', '<a href="https://e.com/a b">go</a>', h => h === 'go'],
        ['other attributes on a are dropped', '<a href="https://e.com" onclick="x()" style="color:red">go</a>', h => h === '<a href="https://e.com" target="_blank" rel="noopener noreferrer">go</a>'],
        ['nested a closes the first', '<a href="https://a.com">x<a href="https://b.com">y</a>z</a>', h => inert(h) === null && h.indexOf('<a href="https://b.com"') > 0],
        ['svg onload dropped with content', '<svg onload=alert(1)><circle/></svg>t', h => h === 't'],
        ['iframe dropped with content', 'a<iframe src="https://x"></iframe>b', h => h === 'ab'],
        ['style dropped with content', 'a<style>p{color:red}</style>b', h => h === 'ab'],
        ['div with style becomes p, style gone', '<div style="x:1" onclick="y()">a</div>', h => h === '<p>a</p>'],
        ['p onclick stripped', '<p onclick="alert(1)">a</p>', h => h === '<p>a</p>'],
        ['unclosed b closed at the end', '<b>bold', h => h === '<b>bold</b>'],
        ['stray closer dropped', 'a</i>b', h => h === 'ab'],
        ['BR self-closing upper-case', 'a<BR/>b<br />c', h => h === 'a<br>b<br>c'],
        ['nested lists survive', '<ul><li>a<ul><li>b</li></ul></li></ul>', h => h === '<ul><li>a<ul><li>b</li></ul></li></ul>'],
        ['li outside a list becomes p', '<li>a</li>', h => h === '<p>a</p>'],
        ['tags inside code are still tags (code is not raw)', '<code><img src=x onerror=1>x</code>', h => h === '<code>x</code>'],
        ['parser-differential <scr<script>ipt>', '<scr<script>ipt>alert(1)</script>', h => inert(h) === null && h.indexOf('script') < 0 || h === '&lt;scr'],
        ['<!--> comment trick', 'a<!-->b<script>alert(1)</script>c', h => inert(h) === null && h.indexOf('alert') < 0],
        ['escaped &lt;script&gt; stays text', '&lt;script&gt;alert(1)&lt;/script&gt;', h => h === '&lt;script&gt;alert(1)&lt;/script&gt;'],
        ['text ampersand re-escaped', 'Tom & Jerry <3', h => h === 'Tom &amp; Jerry &lt;3'],
        ['numeric entity decoded then escaped', '&#60;b&#62;', h => h === '&lt;b&gt;'],
        ['named entities decoded (nbsp/mdash) and kept', 'a&nbsp;b&mdash;c', h => h === 'a b—c'],
        ['unknown named entity stays literal', 'a&bogus;b', h => h === 'a&amp;bogus;b'],
        ['non-ASCII text intact', '<p>Café — 日本語 😀</p>', h => h === '<p>Café — 日本語 😀</p>'],
        ['span unwrapped, text kept', '<span class="x">a</span>b', h => h === 'ab'],
        ['font/table cells dropped, text kept', '<table><tr><td>a</td><td>b</td></tr></table>', h => h === 'ab'],
        ['unclosed attribute quote runs to the end (nothing leaks)', '<b title="x>bold</b> <i>y</i>', h => inert(h) === null && h.indexOf('title') < 0],
        ['unclosed tag at the end is an empty pair or text, never a leak', 'abc<b', h => h === 'abc&lt;b' || h === 'abc' || h === 'abc<b></b>'],
        ['lone < is text', 'a < b', h => h === 'a &lt; b'],
        ['comment dropped', 'a<!-- <script>x</script> -->b', h => h === 'ab'],
        ['processing instruction dropped', 'a<?php echo 1 ?>b', h => h === 'ab'],
        ['doctype dropped', '<!DOCTYPE html>a', h => h === 'a'],
        ['blockquote becomes p', '<blockquote>q</blockquote>', h => h === '<p>q</p>'],
        ['heading tags become p', '<h1>t</h1>', h => h === '<p>t</p>'],
        ['nested p closes the outer', '<p>a<p>b</p>', h => h === '<p>a</p><p>b</p>'],
        ['strong/em/u/s kept', '<strong>a</strong><em>b</em><u>c</u><s>d</s>', h => h === '<strong>a</strong><em>b</em><u>c</u><s>d</s>'],
        ['pre kept', '<pre>x  y</pre>', h => h === '<pre>x  y</pre>'],
        ['empty input', '', h => h === ''],
        ['null input', null, h => h === ''],
        ['number input', 42, h => h === '42'],
    ];
    for (const [name, input, ok] of S) {
        let out; try { out = sanitizeHtml(input); } catch (e) { out = 'THREW ' + e.message; }
        const bad = typeof out === 'string' && out.indexOf('THREW') !== 0 ? inert(out) : 'threw';
        check('sanitize: ' + name, ok(out) && bad === null, JSON.stringify(out) + (bad ? ' [' + bad + ']' : ''));
    }
    // the size cap: a 1 MB input is cut at LIMITS.html before tokenising, in bounded time
    {
        const big = '<b>' + 'x'.repeat(1024 * 1024) + '</b>';
        const t0 = Date.now(); const out = sanitizeHtml(big); const dt = Date.now() - t0;
        check('sanitize: 1 MB input cut at the cap, balanced, under 2 s (' + dt + ' ms)', out.length <= LIMITS.html + 16 && inert(out) === null && dt < 2000, out.length);
        const many = '<p>a</p>'.repeat(20000);
        const t1 = Date.now(); const out2 = sanitizeHtml(many); const dt2 = Date.now() - t1;
        check('sanitize: 20k tags in bounded time (' + dt2 + ' ms)', inert(out2) === null && dt2 < 2000);
        const cut = sanitizeHtml('a'.repeat(LIMITS.html - 2) + '<script>alert(1)</script>');
        check('sanitize: a tag straddling the cap never leaks', inert(cut) === null && cut.indexOf('alert') < 0, cut.slice(-40));
    }

    /* ---- proseHtml parity with the planner's nl() rule ---- */
    check('proseHtml text: two newlines make paragraphs, one a break', proseHtml('a\nb\n\nc', 'text') === '<p>a<br>b</p><p>c</p>', proseHtml('a\nb\n\nc', 'text'));
    check('proseHtml text: block HTML left alone', proseHtml('<p>x</p><ul><li>y</li></ul>', 'text') === '<p>x</p><ul><li>y</li></ul>');
    check('proseHtml text: single line wrapped in p', proseHtml('hello', 'text') === '<p>hello</p>');
    check('proseHtml callout: newline becomes br, no p', proseHtml('a\nb', 'callout') === 'a<br>b');
    check('proseHtml sanitizes', proseHtml('<img src=x onerror=1>hi', 'text') === '<p>hi</p>', proseHtml('<img src=x onerror=1>hi', 'text'));
    check('nl matches planner rule (br for single newline)', nl('a\nb') === 'a<br>b' && nl('a\n\nb', true) === 'a</p><p>b' && nl('<p>a</p>\nb') === '<p>a</p>\nb');

    /* ---- compileFlowchart ---- */
    {
        const fc = { type: 'flowchart', dir: 'LR', space: 'compact', nodes: [{ id: 'a', text: 'Start [here]', shape: 'diamond', color: 'gold' }, { id: 'b c', text: 'x "q" #1', shape: 'pill' }], edges: [{ from: 'a', to: 'b c', text: 'yes', style: 'dotted' }, { from: 'a', to: '' }] };
        const m = compileFlowchart(fc);
        check('flowchart: header, direction and spacing', /^%%\{init: \{"flowchart": \{"nodeSpacing": 18, "rankSpacing": 28, "htmlLabels": true\}\}\}%%\nflowchart LR\n/.test(m), m.split('\n').slice(0, 2).join(' | '));
        check('flowchart: shapes, quoting and escaping', m.indexOf('a{"Start [here]"}:::gold') > 0 && m.indexOf('b_c(["x #quot;q#quot; #35;1"]):::neutral') > 0, m);
        check('flowchart: dotted labelled edge, empty edge skipped', m.indexOf('a -.->|"yes"| b_c') > 0 && (m.match(/-->|-\.->/g) || []).length === 1, m);
        check('flowchart: bad direction/colour fall back', /flowchart TD\n/.test(compileFlowchart({ dir: 'XX', nodes: [{ id: 'n', color: 'pink' }] })) && compileFlowchart({ dir: 'XX', nodes: [{ id: 'n', color: 'pink' }] }).indexOf(':::neutral') > 0);
        check('stripMermaidLinks removes click/callback/href/linkStyle lines', stripMermaidLinks('graph TD\nA-->B\n  click A "javascript:alert(1)"\nCLICK B call x()\nhref A "https://x"\nlinkStyle 0 stroke:red\ncallback A f\nC-->D') === 'graph TD\nA-->B\nC-->D');
    }

    /* ---- cleanDoc ---- */
    const page = (extra) => Object.assign({ type: 'doc', id: 'doc_1', meta: { title: 'Rules', updated: 5, players: true, parentId: 'doc_0', sortIndex: 2, collapsed: true, readerView: true, junk: 1 }, blocks: [
        { id: 'b_1', type: 'h1', title: 'Rules', sub: 'v1' },
        { id: 'b_2', type: 'text', content: '<p>hi <img src=x onerror=1></p>' },
        { id: 'b_2', type: 'h2', title: 'Combat', cols: 9 },
        { type: 'image', src: '/saves/images/m1/café.png', caption: 'c', alt: 'a', layout: { width: 40, float: 'left', dx: 900, dy: -3.6, span: false } },
        { id: 'b_3', type: 'image', src: '/saves/images/../x.png' },
        { id: 'b_4', type: 'image', src: '/saves/images/m1/a.png?x=1' },
        { id: 'b_5', type: 'image', src: 'https://evil/x.png' },
        { id: 'b_6', type: 'node', title: 'scene' },
        { id: 'b_7', type: 'raw', content: '<script>1</script>' },
        { id: 'b_8', type: 'callout', content: 'note', layout: { width: 25, float: 'right', span: true } },
        { id: 'b_9', type: 'table', title: 'T', cols: ['A', 'B'], rows: [['1', '2'], { col1: 'x', col2: 'y', col3: 'z' }, 'bad'] },
        { id: 'b_10', type: 'diagram', content: 'graph TD\nA-->B\nclick A "javascript:alert(1)"' },
        { id: 'b_11', type: 'flowchart', dir: 'LR', nodes: [{ id: 'n1', text: 't', shape: 'hex', color: 'red', extra: 1 }], edges: [{ from: 'n1', to: 'n1', style: 'dotted' }], nodePos: { n1: { x: 1, y: 2 }, 'bad id!': { x: 1, y: 1 } }, nodeSize: { n1: { x: 2, y: 0.5 } }, nodePosSig: 'n1', zoom: 9, boxW: 300.4 },
        { id: 'b_12', type: 'rule' },
        { id: 'b_13', type: 'h3', title: 7 },
        { id: 'b_14', type: 'flare', content: 'f', layout: { width: 33, float: 'left' } },
        null, 'x', { type: 'nope' }
    ] }, extra || {});
    {
        const c = cleanDoc(page());
        check('cleanDoc: type/id/meta reduced', c && c.type === 'doc' && c.id === 'doc_1' && JSON.stringify(Object.keys(c.meta).sort()) === '["parentId","players","sortIndex","title","updated"]', c && JSON.stringify(c.meta));
        const types = c.blocks.map(b => b.type).join(',');
        check('cleanDoc: unknown/planner-only types dropped, order kept', types === 'h1,text,h2,image,image,image,image,callout,table,diagram,flowchart,rule,h3,flare', types);
        check('cleanDoc: every block has a unique id, duplicate re-minted', new Set(c.blocks.map(b => b.id)).size === c.blocks.length && c.blocks[2].id !== 'b_2' && c.blocks[1].id === 'b_2', c.blocks.map(b => b.id).join(','));
        check('cleanDoc: content sanitized', c.blocks[1].content === '<p>hi </p>', c.blocks[1].content);
        check('cleanDoc: h2 cols clamped to 3', c.blocks[2].cols === 3);
        check('cleanDoc: café.png kept, dx clamped, dy rounded, width 40 snapped to 33', c.blocks[3].src === '/saves/images/m1/café.png' && c.blocks[3].layout.dx === 200 && c.blocks[3].layout.dy === -4 && c.blocks[3].layout.float === 'left' && c.blocks[3].layout.width === 33, JSON.stringify(c.blocks[3]));
        check('cleanDoc: .. ? and https src dropped', c.blocks[4].src === '' && c.blocks[5].src === '' && c.blocks[6].src === '');
        check('cleanDoc: callout span implies float none; width clamped to 50 in a 3-col section', c.blocks[7].layout.span === true && c.blocks[7].layout.float === 'none' && c.blocks[7].layout.width === 50, JSON.stringify(c.blocks[7].layout));
        check('cleanDoc: table rows normalised to arrays, object rows read every colN key, bad rows empty', JSON.stringify(c.blocks[8].rows) === '[["1","2"],["x","y","z"],[]]', JSON.stringify(c.blocks[8].rows));
        check('cleanDoc: diagram click line stripped', c.blocks[9].content === 'graph TD\nA-->B', c.blocks[9].content);
        const f = c.blocks[10];
        check('cleanDoc: flowchart fields validated (zoom clamp, boxW rounded, bad nudge key dropped, extra dropped)', f.zoom === 4 && f.boxW === 300 && f.nodePos.n1.x === 1 && !f.nodePos['bad id!'] && f.nodeSize.n1.y === 0.5 && f.nodePosSig === 'n1' && f.nodes[0].extra === undefined && f.nodes[0].shape === 'hex', JSON.stringify(f));
        check('cleanDoc: h3 title coerced to string', c.blocks[12].title === '7');
        check('cleanDoc: flare in a 3-col section cannot float', c.blocks[13].layout.float === 'none' && c.blocks[13].layout.width === 50, JSON.stringify(c.blocks[13].layout));
        check('cleanDoc: hidden page is null', cleanDoc(page({ meta: { title: 'x', players: false } })) === null);
        const kept = cleanDoc(page({ meta: { title: 'x', players: false } }), { keepHidden: true });
        check('cleanDoc: keepHidden keeps it with players false', kept && kept.meta.players === false);
        check('cleanDoc: players absent counts as true', cleanDoc({ type: 'doc', id: 'd', meta: { title: 't' }, blocks: [] }).meta.players === true);
        check('cleanDoc: non-doc / null / non-array blocks', cleanDoc({ type: 'map' }) === null && cleanDoc(null) === null && cleanDoc({ type: 'doc', id: 'd', meta: { title: 't' }, blocks: 'nope' }).blocks.length === 0);
        check('cleanDoc: non-string title becomes Page, huge title cut', cleanDoc({ type: 'doc', id: 'd', meta: { title: {} }, blocks: [] }).meta.title === 'Page' && cleanDoc({ type: 'doc', id: 'd', meta: { title: 'x'.repeat(1000) }, blocks: [] }).meta.title.length === LIMITS.title);
        const manyBlocks = { type: 'doc', id: 'd', meta: { title: 't' }, blocks: Array.from({ length: 700 }, (_, i) => ({ id: 'b' + i, type: 'rule' })) };
        const mc = cleanDoc(manyBlocks);
        check('cleanDoc: block cap applied with a final notice block', mc.blocks.length === LIMITS.blocks + 1 && mc.blocks[LIMITS.blocks].type === 'text' && /too long/.test(mc.blocks[LIMITS.blocks].content), mc.blocks.length);
        const fat = { type: 'doc', id: 'd', meta: { title: 't' }, blocks: Array.from({ length: 60 }, (_, i) => ({ id: 'b' + i, type: 'text', content: 'x'.repeat(60000) })) };
        const fc2 = cleanDoc(fat);
        check('cleanDoc: byte cap applied (2 MB) with the notice', JSON.stringify(fc2).length < LIMITS.bytes + 70000 && fc2.blocks[fc2.blocks.length - 1].type === 'text' && /too long/.test(fc2.blocks[fc2.blocks.length - 1].content), JSON.stringify(fc2).length);
        check('cleanDoc: default layout not carried', cleanDoc({ type: 'doc', id: 'd', meta: { title: 't' }, blocks: [{ type: 'image', src: '', layout: { width: 100, float: 'none', dx: 0, dy: 0 } }] }).blocks[0].layout === undefined);
        check('cleanDoc: a planner-era image width (no layout) becomes layout.width', cleanDoc({ type: 'doc', id: 'd', meta: { title: 't' }, blocks: [{ type: 'image', src: '', width: 50 }] }).blocks[0].layout.width === 50 && cleanDoc({ type: 'doc', id: 'd', meta: { title: 't' }, blocks: [{ type: 'image', src: '', width: 100 }] }).blocks[0].layout === undefined);
        check('render: a planner-era image width is honoured without a layout object', /<figure class="doc-img planner-img" style="width:50%;">/.test(renderDoc({ blocks: [{ type: 'image', src: '/saves/images/x/a.png', width: 50 }] })));
        check('cleanDoc: layout on a prose text block ignored', cleanDoc({ type: 'doc', id: 'd', meta: { title: 't' }, blocks: [{ type: 'text', content: 'x', layout: { width: 50 } }] }).blocks[0].layout === undefined);
        check('cleanDoc: an object with __proto__ block id does not poison', (() => { const d = cleanDoc({ type: 'doc', id: 'd', meta: { title: 't' }, blocks: [{ id: '__proto__', type: 'rule' }, { id: 'constructor', type: 'rule' }] }); return d.blocks.length === 2 && d.blocks[0].id === '__proto__' && d.blocks[1].id === 'constructor' && ({}).polluted === undefined; })());
    }

    /* ---- renderDoc ---- */
    {
        const c = cleanDoc(page());
        const html = renderDoc(c, { src: p => '/blob/' + p });
        check('render: root wrap and pv-blk/data-blk per block', html.indexOf('<div class="wrap">') === 0 && (html.match(/class="pv-blk" data-blk="\d+"/g) || []).length === c.blocks.length, html.slice(0, 120));
        check('render: h1 with sub escaped', html.indexOf('<h1>Rules<span class="sub">v1</span></h1>') > 0);
        check('render: h2 opens a 3-column section, closed with doc-clear', html.indexOf('<h2>Combat</h2></div><div class="doc-section doc-cols-3">') > 0 && html.indexOf('</div><div class="doc-clear"></div>') > 0, html);
        check('render: image through opts.src with data-path, float class, width and nudge style', /<figure class="doc-img planner-img fl-left" style="width:33%;position:relative;left:200px;top:-4px;"><img src="\/blob\/\/saves\/images\/m1\/café\.png" data-path="\/saves\/images\/m1\/café\.png" alt="a"><figcaption>c<\/figcaption><\/figure>/.test(html), html);
        check('render: empty image shows a placeholder, never an img', (html.match(/doc-noimg/g) || []).length === 3 && (html.match(/<img /g) || []).length === 1);
        check('render: table with head and cells escaped, widened to the longest row', html.indexOf('<table class="doc-table"><thead><tr><th>A</th><th>B</th><th></th></tr></thead><tbody><tr><td>1</td><td>2</td><td></td></tr><tr><td>x</td><td>y</td><td>z</td></tr><tr><td></td><td></td><td></td></tr></tbody></table>') > 0, html);
        check('render: an uncleaned grid table (object rows, no cols yet) shows every typed column', renderDoc({ blocks: [{ type: 'table', rows: [{ col1: 'Fast', col2: '4 miles', col3: '<i>' }] }] }).indexOf('<tbody><tr><td>Fast</td><td>4 miles</td><td>&lt;i&gt;</td></tr></tbody>') > 0);
        check('render: diagram as escaped mermaid pre', html.indexOf('<div class="diagram"><pre class="mermaid">graph TD\nA--&gt;B</pre></div>') > 0, html);
        check('render: flowchart in an fc-box with data-fc and box size', /<div class="diagram fc-box" data-fc="10" style="width:300px;"><pre class="mermaid">/.test(html), html);
        check('render: rule and h3', html.indexOf('<hr class="doc-rule">') > 0 && html.indexOf('<h3 class="doc-h3">7</h3>') > 0);
        check('render: callout span class', html.indexOf('<div class="callout doc-span" style="width:50%;">note</div>') > 0, html);
        const hostile = renderDoc({ type: 'doc', blocks: [{ type: 'h1', title: '<b>x</b>', sub: '"><img src=x onerror=1>' }, { type: 'table', title: '<i>', cols: ['<s>'], rows: [['<u>']] }, { type: 'image', src: '/saves/images/a"b.png', caption: '<img>' }, { type: 'diagram', content: '<script>' }] });
        check('render: titles, cells, captions and diagram sources are escaped text', hostile.indexOf('<b>x</b>') < 0 && hostile.indexOf('<img src=x') < 0 && hostile.indexOf('<i>') < 0 && hostile.indexOf('<s>') < 0 && hostile.indexOf('<u>') < 0 && hostile.indexOf('<script') < 0 && hostile.indexOf('&lt;b&gt;x&lt;/b&gt;') > 0 && hostile.indexOf('<img src="/saves/images/a&quot;b.png" data-path="/saves/images/a&quot;b.png" alt="&lt;img&gt;">') > 0 && (hostile.match(/<img /g) || []).length === 1, hostile);
        check('render: unknown block types render nothing; null blocks skipped', renderDoc({ blocks: [{ type: 'raw', content: '<script>' }, null, { type: 'node' }] }) === '<div class="wrap"></div>');
        check('render: opts.mermaid false gives plain code', renderDoc({ blocks: [{ type: 'diagram', content: 'g' }] }, { mermaid: false }).indexOf('<pre class="doc-code">g</pre>') > 0);
        check('render: opts.empty for an empty page', renderDoc({ blocks: [] }, { empty: '<i>hint</i>' }) === '<div class="wrap"><i>hint</i></div>');
        check('render: raw (uncleaned) doc with hostile content is still sanitized', (() => { const h = renderDoc(page()); return h.indexOf('onerror') < 0 && h.indexOf('<script') < 0 && h.indexOf('javascript:') < 0; })());
        // a two-column section holding a floated picture and prose, closed by the next h1
        const two = renderDoc({ blocks: [{ type: 'h2', title: 'S', cols: 2 }, { type: 'image', src: '/saves/images/x/a.png', layout: { width: 33, float: 'right' } }, { type: 'text', content: 'body' }, { type: 'h1', title: 'Next' }] });
        check('render: two-column section wraps the picture and the prose and closes before the next h1', /<div class="doc-section doc-cols-2"><div class="pv-blk" data-blk="1"><figure class="doc-img planner-img fl-right" style="width:33%;">[\s\S]*<p>body<\/p><\/div><\/div><div class="doc-clear"><\/div><div class="pv-blk" data-blk="3"><h1>Next<\/h1>/.test(two), two);
        check('DOC_BLOCKS roster', DOC_BLOCKS.join(',') === 'h1,h2,h3,text,lede,oneline,callout,flare,image,table,rule,diagram,flowchart');
        /* ---- document appearance (cleanDocStyle / docStyleCss): a curated, injection-proof styling layer ---- */
        check('cleanDocStyle: keeps a known font, hex colours, a clean image ref', JSON.stringify(cleanDocStyle({ font: 'serif', textColor: '#ABC', bgColor: '#11223344', bgImage: 'saves/p/a.png' })) === '{"font":"serif","textColor":"#ABC","bgColor":"#11223344","bgImage":"saves/p/a.png"}');
        check('cleanDocStyle: drops an unknown font, a non-hex colour, a quoted/parenthesised image ref', cleanDocStyle({ font: 'evil;}', textColor: 'red;}x{', bgColor: 'rgb(1,2,3)', bgImage: 'a");b(' }) === null);
        check('cleanDocStyle: empty / non-object / all-invalid -> null', cleanDocStyle(null) === null && cleanDocStyle({}) === null && cleanDocStyle({ font: 'nope' }) === null);
        check('cleanDocStyle: every DOC_FONTS key is accepted', Object.keys(DOC_FONTS).every(k => cleanDocStyle({ font: k })) && !DOC_FONTS.hasOwnProperty('nope'));
        check('docStyleCss: single quotes only (safe inside a style="" attribute)', (() => { const css = docStyleCss({ font: 'serif', textColor: '#abc', bgImage: 'p/a.png' }); return css.indexOf('"') < 0 && css.indexOf('font-family:') === 0 && css.indexOf("url('p/a.png')") > 0; })());
        check('docStyleCss: drops a background whose resolver returns an unsafe URL', docStyleCss({ bgImage: 'ok' }, () => 'has")bad').indexOf('background-image') < 0);
        check('cleanDoc: a valid meta.style survives; a hostile one is dropped', (() => { const a = cleanDoc({ type: 'doc', id: 'd', meta: { title: 'T', style: { font: 'mono', textColor: '#fff' } }, blocks: [] }); const b = cleanDoc({ type: 'doc', id: 'd', meta: { title: 'T', style: { font: 'x;}', textColor: 'red' } }, blocks: [] }); return a.meta.style && a.meta.style.font === 'mono' && !b.meta.style; })());
    }

    /* ---- docmd.js: Markdown in and out ---- */
    const mdUrl = 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'docmd.js')).replace(/\\/g, '/');
    let M = null, mdErr = null;
    try { M = await import(mdUrl); } catch (e) { mdErr = e; }
    check('docmd.js loads in Node with no window', !!M && !mdErr, mdErr && mdErr.message);
    if (M) {
        const { markdownToBlocks, docToMarkdown, htmlToMarkdown, flowchartFromMermaid, flowchartToMermaid, parseAttrs, detectBundle, TEMPLATE } = M;
        const types = (r) => r.blocks.map(b => b.type).join(',');
        check('parseAttrs: known keys only', JSON.stringify(parseAttrs('{width=50 float=left span}')) === '{"width":"50","float":"left","span":"true"}' && parseAttrs('{advanced}') === null && parseAttrs('{width=50 x=1}') === null);
        // the cheat sheet, as a page
        const page = markdownToBlocks(TEMPLATE, { kind: 'doc' });
        check('template → page: front matter title/subtitle/players', page.meta.title === 'House rules' && page.meta.subtitle === 'What the table agreed on' && page.meta.players === true, JSON.stringify(page.meta));
        check('template → page: block roster in order', types(page) === 'h1,lede,h2,text,h3,callout,flare,oneline,table,image,text,flowchart,diagram,rule,text', types(page));
        const h1 = page.blocks[0], h2 = page.blocks[2], tbl = page.blocks[8], img = page.blocks[9], fc = page.blocks[11];
        check('template → page: h1 sub from front matter, h2 cols from the tail', h1.title === 'House rules' && h1.sub === 'What the table agreed on' && h2.title === 'At the table' && h2.cols === 2, JSON.stringify([h1, h2]));
        check('template → page: prose keeps b/i/s/u/code/link/lists, drops nothing dangerous', /<p>Plain paragraphs are text\. <b>Bold<\/b>, <i>italic<\/i>, <s>strike<\/s>, <u>underline<\/u>, <code>code<\/code>, <a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">links<\/a>, bullets and numbers all survive:<\/p><ul><li>a bullet<ul><li>nested two spaces in<\/li><\/ul><\/li><\/ul><ol><li>a number<\/li><\/ol>/.test(page.blocks[3].content), page.blocks[3].content);
        check('template → page: table title from the bold line, headers and rows', tbl.title === 'Travel pace' && tbl.cols.join('|') === 'Pace|Per hour|Effect' && tbl.rows.length === 2 && tbl.rows[0].col1 === 'Fast' && tbl.rows[1].col3 === 'none', JSON.stringify(tbl));
        check('template → page: picture with layout, listed for upload', img.type === 'image' && img.caption === 'The basement' && img.layout.width === 33 && img.layout.float === 'right' && page.images.length === 1 && page.images[0].kind === 'file' && page.images[0].name === 'map_basement.jpg' && page.images[0].index === 9, JSON.stringify(img) + ' ' + JSON.stringify(page.images));
        check('template → page: flowchart fence became a native flowchart', fc.type === 'flowchart' && fc.dir === 'LR' && fc.nodes.length === 3 && fc.nodes[0].text === 'Roll initiative' && fc.nodes[0].color === 'gold' && fc.nodes[1].shape === 'diamond' && fc.edges.length === 2 && fc.edges[1].text === 'yes', JSON.stringify(fc));
        check('template → page: mermaid fence is a diagram with its source', page.blocks[12].type === 'diagram' && /sequenceDiagram/.test(page.blocks[12].content));
        // the same sheet as a planner
        const plan = markdownToBlocks(TEMPLATE, { kind: 'planner' });
        check('template → planner: h3 becomes a bold lead line, rule a boundary, table a node table, layout to width/align', plan.blocks.every(b => b.type !== 'h3' && b.type !== 'rule') && plan.blocks.some(b => b.type === 'node' && b.mode === 'table' && b.title === 'Travel pace') && plan.blocks.some(b => b.type === 'text' && /<p><b>Sub-heading<\/b><\/p>/.test(b.content)) && plan.blocks.find(b => b.type === 'image').width === 33 && plan.blocks.find(b => b.type === 'image').align === 'right', types(plan));
        check('template → planner: front matter players is not for planners (noted), diagram source entity-escaped', plan.notes.some(n => /players/.test(n)) && plan.blocks.find(b => b.type === 'diagram').content.indexOf('&gt;&gt;') > 0);
        // a scene node with a map link
        const items = { m1: { id: 'm1', type: 'map', meta: { title: 'Ahto East' }, rooms: [{ id: 'r9', name: 'Cargo lock' }] } };
        const sc = markdownToBlocks('# Plan\n\n### Scene: The docks\n**Tag:** Stealth\n**Must resolve:** Who tipped them off?\nMap: ahto east / cargo LOCK\n| Action | Why | Cost | Returns via |\n|---|---|---|---|\n| Bribe | fastest | 200 | Arcade |\n\nAfterwards.', { kind: 'planner', items });
        const node = sc.blocks[1];
        check('planner scene node: title, tag, must, map + room by name, table rows', node.type === 'node' && node.title === 'The docks' && node.tag === 'Stealth' && node.must === 'Who tipped them off?' && node.linkMapId === 'm1' && node.linkRoomId === 'r9' && node.cols.length === 4 && node.rows[0].col4 === 'Arcade' && sc.blocks[2].type === 'text', JSON.stringify(sc.blocks));
        check('page: "### Scene:" is just a sub-heading', markdownToBlocks('# P\n### Scene: X', { kind: 'doc' }).blocks[1].type === 'h3');
        // Google Docs' reference-style data: image, inline images, unknown braces, nested quotes, html
        const gd = markdownToBlocks('# T\n\nSee the map ![][image1] here.\n\n## Formulas {advanced}\n\n> outer\n> > inner\n\n<div onclick="x()">hi <script>alert(1)</script><u>u</u></div>\n\n[image1]: <data:image/png;base64,iVBORw0KGgo=>\n', { kind: 'doc' });
        check('google docs form: reference image resolved to data, split out after its paragraph', gd.blocks[1].type === 'text' && gd.blocks[2].type === 'image' && gd.images[0].kind === 'data' && /^data:image\/png/.test(gd.images[0].value) && gd.notes.some(n => /inside a paragraph/.test(n)), types(gd) + ' ' + JSON.stringify(gd.images));
        check('unknown braces stay in the heading', gd.blocks[3].type === 'h2' && gd.blocks[3].title === 'Formulas {advanced}', gd.blocks[3].title);
        check('nested quote flattened with a note; html reduced to the allow-list', gd.blocks[4].type === 'callout' && gd.notes.some(n => /nested quote/.test(n)) && gd.blocks[5].content === '<p>hi <u>u</u></p>', JSON.stringify(gd.blocks.slice(4)));
        check('https picture becomes a link paragraph with a note', (() => { const r = markdownToBlocks('![Cover](https://x.example/a.png)', { kind: 'doc' }); return r.blocks.length === 1 && r.blocks[0].type === 'text' && r.blocks[0].content.indexOf('<a href="https://x.example/a.png"') > 0 && r.images.length === 0; })());
        check('::: fence and [!type] quote pick the prose block; plain quote is a callout', types(markdownToBlocks('::: flare\nx\n:::\n\n> [!oneline] y\n\n> z', { kind: 'doc' })) === 'flare,oneline,callout');
        check('javascript link becomes text; autolink kept', (() => { const r = markdownToBlocks('[x](javascript:alert(1)) <https://a.b/c>', { kind: 'doc' }); return r.blocks[0].content === '<p>x <a href="https://a.b/c" target="_blank" rel="noopener noreferrer">https://a.b/c</a></p>'; })(), JSON.stringify(markdownToBlocks('[x](javascript:alert(1)) <https://a.b/c>', { kind: 'doc' }).blocks));
        check('block cap 300 with a note', (() => { const r = markdownToBlocks(Array.from({ length: 320 }, (_, i) => '## S' + i).join('\n\n'), { kind: 'doc' }); return r.blocks.length === 300 && r.notes.some(n => /first 300/.test(n)); })());
        check('flowchartFromMermaid: beyond the subset → null (classDef, subgraph, &)', flowchartFromMermaid('flowchart TD\nclassDef x fill:#fff\nA-->B') === null && flowchartFromMermaid('graph LR\nsubgraph s\nA-->B\nend') === null && flowchartFromMermaid('flowchart LR\nA & B --> C') === null && flowchartFromMermaid('pie\nA: 1') === null);
        check('flowchartFromMermaid: chains, labels, dotted, shapes', (() => { const f = flowchartFromMermaid('graph TB\n  A[Start] --> B{Choice?} -.->|no| C([End]):::red\n  B -- yes --> D{{Hex}}'); return f && f.dir === 'TD' && f.nodes.map(n => n.id + ':' + n.shape).join(',') === 'A:rect,B:diamond,C:pill,D:hex' && f.nodes[2].color === 'red' && f.edges.length === 3 && f.edges[1].style === 'dotted' && f.edges[1].text === 'no' && f.edges[2].text === 'yes'; })());
        // export and the round trip
        const D2 = D;
        const src = { type: 'doc', id: 'doc_x', meta: { title: 'Rules', players: false }, blocks: D2.cleanDoc({ type: 'doc', id: 'doc_x', meta: { title: 'Rules', players: false }, blocks: [
            { id: 'a', type: 'h1', title: 'Rules', sub: 'v2' }, { id: 'b', type: 'lede', content: 'Short <b>intro</b>' }, { id: 'c', type: 'h2', title: 'Combat', cols: 2 },
            { id: 'd', type: 'text', content: '<p>Roll <i>d20</i> and <a href="https://e.com/x">read</a></p><ul><li>one<ul><li>two</li></ul></li></ul><p>a &amp; b</p>' },
            { id: 'e', type: 'h3', title: 'Sub' }, { id: 'f', type: 'image', src: '/saves/images/doc_x/ab12cd34_map.png', caption: 'The map', layout: { width: 33, float: 'left', dx: 8, dy: -4, span: false } },
            { id: 'g', type: 'table', title: 'Pace', cols: ['A', 'B|C'], rows: [['1', '2'], ['x', 'y']] }, { id: 'h', type: 'rule' },
            { id: 'i', type: 'callout', content: 'Note line one<br>line two' }, { id: 'j', type: 'diagram', content: 'graph TD\nA-->B' },
            { id: 'k', type: 'flowchart', dir: 'LR', nodes: [{ id: 'n1', text: 'Roll "it"', shape: 'gold' === 'x' ? 'rect' : 'rounded', color: 'gold' }, { id: 'n2', text: 'Done', shape: 'pill', color: 'neutral' }], edges: [{ from: 'n1', to: 'n2', text: 'ok', style: 'dotted' }] }
        ] }, { keepHidden: true }).blocks };
        const ex = docToMarkdown(src, {});
        check('export: front matter, headings with cols, picture path and layout tail, table, rule, fences', /^---\ntitle: Rules\nsubtitle: v2\nplayers: false\n---\n\n# Rules\n\*v2\*\n\n> \[!lede\] Short \*\*intro\*\*\n\n## Combat \{cols=2\}\n/.test(ex.text) && ex.text.indexOf('![The map](images/doc_x/map.png){width=33 float=left dx=8 dy=-4}') > 0 && ex.text.indexOf('**Pace**\n| A | B\\|C |\n|---|---|\n| 1 | 2 |\n| x | y |') > 0 && ex.text.indexOf('\n---\n') > 0 && ex.text.indexOf('```mermaid\ngraph TD\nA-->B\n```') > 0 && ex.text.indexOf('```flowchart\nflowchart LR\nn1("Roll #quot;it#quot;"):::gold\nn2(["Done"])\nn1 -.->|"ok"| n2\n```') > 0 && ex.images.length === 1 && ex.images[0].name === 'map.png', ex.text);
        check('export: prose to markdown (links, nested list, entities, breaks)', ex.text.indexOf('Roll *d20* and [read](https://e.com/x)\n\n- one\n  - two\n\na & b') > 0 && ex.text.indexOf('> [!callout] Note line one  \n> line two') > 0, ex.text);
        const back = markdownToBlocks(ex.text, { kind: 'doc' });
        const strip = (bs) => bs.map(b => { const o = Object.assign({}, b); delete o.id; delete o.src; delete o.zoom; delete o.space; if (o.layout && o.layout.span === false) delete o.layout.span; return o; });
        const want = strip(src.blocks).map(b => { if (b.type === 'table') b.rows = b.rows.map(r => ({ col1: r[0], col2: r[1] })); if (b.type === 'image') { b.alt = undefined; delete b.alt; } return b; });
        const got = strip(back.blocks);
        check('round trip: the same block types, titles, contents and layout come back', JSON.stringify(got.map(b => b.type)) === JSON.stringify(want.map(b => b.type)) && got[0].title === 'Rules' && got[0].sub === 'v2' && got[2].cols === 2 && got[3].content === want[3].content && got[5].caption === 'The map' && JSON.stringify(got[5].layout) === JSON.stringify(want[5].layout) && got[6].title === 'Pace' && got[6].cols.join('|') === 'A|B|C' && got[6].rows[1].col2 === 'y' && got[8].content === 'Note line one<br>line two' && got[9].content === 'graph TD\nA-->B' && got[10].nodes[0].text === 'Roll "it"' && got[10].edges[0].style === 'dotted' && back.meta.players === false, JSON.stringify(got) + '\n---\n' + JSON.stringify(want));
        check('round trip: the lede keeps its inline markup', got[1].content === 'Short <b>intro</b>', got[1].content);
        // a planner with a scene node and raw block round-trips its own way
        const plItems = { m1: { id: 'm1', type: 'map', meta: { title: 'Ahto East' }, rooms: [{ id: 'r9', name: 'Cargo lock' }] } };
        const pl = { type: 'planner', id: 'plan_1', meta: { title: 'Session', status: 'next' }, blocks: [{ type: 'h1', title: 'Session', sub: '' }, { type: 'node', title: 'The docks', tag: 'Stealth', must: 'Who?', linkMapId: 'm1', linkRoomId: 'r9', cols: ['Action', 'Why'], rows: [{ col1: 'Bribe', col2: 'fast' }] }, { type: 'node', mode: 'table', title: 'NPCs', cols: ['Name'], rows: [{ col1: 'Vane' }] }, { type: 'raw', content: '<b>raw</b>' }] };
        const plx = docToMarkdown(pl, { items: plItems });
        check('planner export: status, scene node with map line and table, raw as an html fence', /status: next/.test(plx.text) && plx.text.indexOf('### Scene: The docks\n**Tag:** Stealth\n**Must resolve:** Who?\nMap: Ahto East / Cargo lock\n| Action | Why |') > 0 && plx.text.indexOf('**NPCs**\n| Name |') > 0 && plx.text.indexOf('```html\n<b>raw</b>\n```') > 0, plx.text);
        const plb = markdownToBlocks(plx.text, { kind: 'planner', items: plItems });
        check('planner round trip: scene node, table node, html fence as code (never raw)', types(plb) === 'h1,node,node,text' && plb.blocks[1].linkRoomId === 'r9' && plb.blocks[1].rows[0].col1 === 'Bribe' && plb.blocks[2].mode === 'table' && /<pre><code>&lt;b&gt;raw/.test(plb.blocks[3].content) && plb.meta.status === 'next', types(plb) + ' ' + JSON.stringify(plb.blocks[3]));
        check('detectBundle: .md at the root or one folder down, __MACOSX and dotfiles ignored', (() => { const b = detectBundle([{ name: '__MACOSX/x.md', data: new Uint8Array() }, { name: 'Folder/.hidden.md', data: new Uint8Array() }, { name: 'Folder/page.md', data: new Uint8Array() }, { name: 'Folder/images/a.png', data: new Uint8Array() }]); return b && b.md.name === 'Folder/page.md' && b.base === 'Folder/' && b.files.length === 2; })() && detectBundle([{ name: 'a/b/c.md', data: new Uint8Array() }]) === null && detectBundle([{ name: 'data.json', data: new Uint8Array() }]) === null);
        check('htmlToMarkdown: code and pre', htmlToMarkdown('<p>use <code>x</code></p><pre>a\n b</pre>') === 'use `x`\n\n```\na\n b\n```');
    }

    /* ---- publication under a window ---- */
    global.window = {};
    const D2 = await import(url + '?x');
    check('window.wpDocRender published with the API', !!(global.window.wpDocRender && global.window.wpDocRender.cleanDoc && global.window.wpDocRender.renderDoc && global.window.wpDocRender.sanitizeHtml && global.window.wpDocRender.VERSION === D2.VERSION));
    delete global.window;

    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();

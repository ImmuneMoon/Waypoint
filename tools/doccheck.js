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
const ALLOWED = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'ul', 'ol', 'li', 'code', 'pre', 'a', 'span']);
// the one form a span may take (text style, 1.5.0): a colour, a size step, or both, written by the sanitiser itself
const SPAN_OK = /^ style="(color:#[0-9a-f]{6}|font-size:(0\.833|1\.2|1\.44|1\.728)em|color:#[0-9a-f]{6};font-size:(0\.833|1\.2|1\.44|1\.728)em)"$/;
function inert(html) {
    const stack = [];
    const re = /<(\/?)([a-z0-9]+)([^>]*)>/g; let m;
    while ((m = re.exec(html))) {
        const name = m[2], attrs = m[3];
        if (!ALLOWED.has(name)) return 'tag ' + name;
        if (m[1]) { if (stack.pop() !== name) return 'unbalanced ' + name; continue; }
        if (name === 'br') { if (attrs) return 'br attrs'; continue; }
        if (name === 'a') { if (!/^ href="https?:\/\/[^"]*" target="_blank" rel="noopener noreferrer"$/.test(attrs)) return 'a attrs ' + attrs; }
        else if (name === 'span') { if (!SPAN_OK.test(attrs)) return 'span attrs ' + attrs; }
        else if (attrs) return 'attrs on ' + name + ': ' + attrs;
        stack.push(name);
    }
    if (stack.length) return 'open at end: ' + stack.join(',');
    if (/<[^a-z\/]/i.test(html)) return 'stray <';
    if (/on[a-z]+\s*=|javascript:|<script|<img|<svg|<iframe|<style|<object|<embed/i.test(html)) return 'dangerous text';
    return null;
}
// a rendered page: no tag that runs, no handler, and no style but the fixed words the renderer writes itself
function risksNone(html) {
    if (/<(script|iframe|object|embed|svg|math|style|link|meta|base|form)\b/i.test(html) || /\son[a-z]+\s*=/i.test(html)) return false;
    const styles = html.match(/style="[^"]*"/g) || [];
    return styles.every(s => /^style="((color:#[0-9a-f]{6};|font-weight:bold;|font-style:italic;|font-size:(0\.833|1\.2|1\.44|1\.728)em;|width:\d+%;|height:\d+px;|width:\d+px;|position:relative;left:-?\d+px;top:-?\d+px;)*)"$/.test(s));
}

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    /* ---- the guard: loads with no window ---- */
    let D = null, loadErr = null;
    try { D = await import(url); } catch (e) { loadErr = e; }
    check('module loads in Node with no window (the guard)', !!D && !loadErr, loadErr && loadErr.message);
    if (!D) { console.log('\n' + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const { sanitizeHtml, cleanDoc, renderDoc, proseHtml, nl, compileFlowchart, stripMermaidLinks, LIMITS, DOC_BLOCKS, cleanDocStyle, docStyleCss, mergeDocStyle, docBgImage, DOC_FONTS } = D;

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
        const fp = cleanDoc({ type: 'doc', id: 'doc_fp', meta: { title: 'F' }, blocks: [JSON.parse('{"id":"b_p","type":"flowchart","nodes":[{"id":"n1","text":"t"}],"edges":[],"nodePos":{"n1":{"x":1,"y":2},"constructor":{"x":3,"y":3},"__proto__":{"x":4,"y":4},"hasOwnProperty":{"x":5,"y":5},"BYTES_PER_ELEMENT":{"x":6,"y":6}},"nodeSize":{"toString":{"x":2,"y":2},"n1":{"x":2,"y":2}}}')] }).blocks[0];
        check('cleanDoc: a flowchart nudge or size keyed by an Object.prototype name is dropped (the packer refuses an own "constructor" or "hasOwnProperty": the doc and every join snapshot would fail silently)', Object.keys(fp.nodePos).join() === 'n1' && Object.getPrototypeOf(fp.nodePos) === Object.prototype && Object.keys(fp.nodeSize).join() === 'n1', JSON.stringify(fp));
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
        check('Stage 6: Inter is a document font (bundled), and cleanDocStyle keeps it', typeof DOC_FONTS.inter === 'string' && /^Inter,/.test(DOC_FONTS.inter) && cleanDocStyle({ font: 'inter' }).font === 'inter');
        check('cleanDocStyle: drops an unknown font, a non-hex colour, an image ref with an angle bracket', cleanDocStyle({ font: 'evil;}', textColor: 'red;}x{', bgColor: 'rgb(1,2,3)', bgImage: 'a<b' }) === null);
        check('cleanDocStyle: image ref refuses a backslash, a control char and a ".." segment; keeps a real library name (spaces, apostrophe, parentheses, em dash)', cleanDocStyle({ bgImage: 'a\\b' }) === null && cleanDocStyle({ bgImage: 'a\u0001b' }) === null && cleanDocStyle({ bgImage: '/saves/images/../x.png' }) === null && cleanDocStyle({ bgImage: "/saves/images/m/Ror'Chiir — token (v2).png" }).bgImage === "/saves/images/m/Ror'Chiir — token (v2).png");
        check('cleanDocStyle: image ref refuses a scheme (https:, data:, javascript:), a protocol-relative //host and a percent-spelled dot segment', cleanDocStyle({ bgImage: 'https://evil.example/t.png' }) === null && cleanDocStyle({ bgImage: 'data:image/png;base64,AAAA' }) === null && cleanDocStyle({ bgImage: 'javascript:alert(1)' }) === null && cleanDocStyle({ bgImage: '//evil.example/t.png' }) === null && cleanDocStyle({ bgImage: '/saves/images/%2e%2e/data.json' }) === null && cleanDocStyle({ bgImage: '/saves/images/m/x.png' }).bgImage === '/saves/images/m/x.png');
        check('docBgImage: a served path is percent-encoded so spaces/quotes/parentheses never break url()', docBgImage({ bgImage: "/saves/images/m/a b (x)'y.jpg" }) === "url('/saves/images/m/a%20b%20%28x%29%27y.jpg')");
        check('docBgImage: a data: URL (a player\'s cached picture) passes through untouched; scrim goes first', docBgImage({ bgImage: 'x', bgDim: 40 }, () => 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==') === "linear-gradient(rgba(0,0,0,0.4),rgba(0,0,0,0.4)),url('data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==')");
        check('docBgImage: a resolver that hands back something un-encodable or quote-bearing yields nothing', docBgImage({ bgImage: 'x' }, () => 'data:image/png;base64,a\'b') === '' && docBgImage({ bgImage: 'x' }, () => 42) === '');
        check('cleanDocStyle: empty / non-object / all-invalid -> null', cleanDocStyle(null) === null && cleanDocStyle({}) === null && cleanDocStyle({ font: 'nope' }) === null);
        check('cleanDocStyle: every DOC_FONTS key is accepted', Object.keys(DOC_FONTS).every(k => cleanDocStyle({ font: k })) && !DOC_FONTS.hasOwnProperty('nope'));
        check('docStyleCss: single quotes only (safe inside a style="" attribute)', (() => { const css = docStyleCss({ font: 'serif', textColor: '#abc', bgImage: 'p/a.png' }); return css.indexOf('"') < 0 && css.indexOf('font-family:') === 0 && css.indexOf("url('p/a.png')") > 0; })());
        check('docStyleCss: a resolver URL with a quote and a parenthesis is percent-encoded, never emitted raw', (() => { const css = docStyleCss({ bgImage: 'ok' }, () => 'has")bad'); return css.indexOf("url('has%22%29bad')") > 0 && css.indexOf('"') < 0; })());
        check('cleanDocStyle: bgDim clamps to 0..90 and rounds, keeping 0', cleanDocStyle({ bgDim: 200 }).bgDim === 90 && cleanDocStyle({ bgDim: -5 }).bgDim === 0 && cleanDocStyle({ bgDim: 40.6 }).bgDim === 41 && cleanDocStyle({ bgDim: 0 }).bgDim === 0);
        check('cleanDocStyle: a non-number / non-finite bgDim is dropped', !('bgDim' in (cleanDocStyle({ font: 'serif', bgDim: '40' }) || {})) && !('bgDim' in (cleanDocStyle({ font: 'serif', bgDim: Infinity }) || {})));
        check('docStyleCss: bgDim>0 lays a dark scrim gradient before the image url', (() => { const css = docStyleCss({ bgImage: 'p/a.png', bgDim: 40 }); return css.indexOf("linear-gradient(rgba(0,0,0,0.4),rgba(0,0,0,0.4)),url('p/a.png')") > 0; })());
        check('docStyleCss: bgDim 0 renders the image with no scrim', docStyleCss({ bgImage: 'p/a.png', bgDim: 0 }).indexOf('linear-gradient') < 0);
        check('mergeDocStyle: a page bgDim of 0 overrides an inherited scrim', mergeDocStyle({ bgImage: 'p/a.png', bgDim: 40 }, { bgDim: 0 }).bgDim === 0);
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
        {   // a bold of one letter was read as a stray marker and an italic ("**b**" came in as "*" + italic "b*"), and the next bold on the line was swallowed
            const one = t => markdownToBlocks(t, { kind: 'doc' }).blocks.map(b => b.content).join('|');
            const cases = [['**b**', '<p><b>b</b></p>'], ['__c__', '<p><b>c</b></p>'], ['x **b** y', '<p>x <b>b</b> y</p>'], ['**b** and **cd**', '<p><b>b</b> and <b>cd</b></p>'], ['**B**old', '<p><b>B</b>old</p>'],
                ['**bold**', '<p><b>bold</b></p>'], ['**a b**', '<p><b>a b</b></p>'], ['*i*', '<p><i>i</i></p>'], ['*it al*', '<p><i>it al</i></p>'], ['a ** b ** c', '<p>a ** b ** c</p>'], ['** b**', '<p>** b**</p>'],
                ['***b***', '<p><b><i>b</i></b></p>'], ['___c___', '<p><b><i>c</i></b></p>'], ['***bold it*** and *i*', '<p><b><i>bold it</i></b> and <i>i</i></p>'], ['**a *b* c**', '<p><b>a <i>b</i> c</b></p>']];
            const got = cases.map(c => one(c[0]));
            const back = htmlToMarkdown('<p><b>b</b> and <i>c</i> and <b><i>d</i></b></p>');
            check('Markdown import: a bold of one letter is bold (**b**, __c__, inside a word, two on a line: the second no longer swallowed), longer ones as before, three markers bold and italic together, markers with a space inside stay text; and a one-letter bold or italic written by the export reads back as it was',
                cases.every((c, i) => got[i] === c[1]) && one(back) === '<p><b>b</b> and <i>c</i> and <b><i>d</i></b></p>', JSON.stringify([cases.map((c, i) => got[i] === c[1] ? null : [c[0], got[i]]).filter(Boolean), back, one(back)]));
        }
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
        // text style: Markdown has no colour and no size — an export writes the plain text, an import brings no format
        {
            const RED = '#d9534f';
            const stPl = { type: 'planner', id: 'plan_s', meta: { title: 'Styled' }, blocks: [
                { type: 'h1', title: 'Session', sub: 'one', fmt: { title: { color: RED, b: true }, sub: { i: true } } }, { type: 'h2', title: 'Beats', fmt: { title: { size: 'huge' } } },
                { type: 'node', title: 'The docks', tag: 'Stealth', must: 'Who?', cols: ['Action', 'Why'], colFmt: [{ b: true }], fmt: { title: { color: RED }, tag: { i: true }, must: { spans: [{ s: 0, e: 3, b: true }] } }, rows: [{ col1: 'Bribe', col2: 'fast', fmt: { col1: { spans: [{ s: 0, e: 2, color: RED, i: true }] } } }] },
                { type: 'text', content: '<p><span style="color:#d9534f">red</span> and <span style="font-size:1.44em"><b>big</b></span></p>' },
                { type: 'flowchart', dir: 'LR', nodes: [{ id: 'a', text: 'buy milk', fmt: { color: RED, spans: [{ s: 0, e: 3, b: true }] } }, { id: 'b', text: 'done' }], edges: [{ from: 'a', to: 'b', text: 'then', fmt: { i: true } }] },
                { type: 'image', src: '', caption: 'cap', fmt: { caption: { b: true } } } ] };
            const plainPl = JSON.parse(JSON.stringify(stPl)); plainPl.blocks.forEach(b => { delete b.fmt; delete b.colFmt; (b.rows || []).forEach(r => delete r.fmt); (b.nodes || []).forEach(n => delete n.fmt); (b.edges || []).forEach(e => delete e.fmt); }); plainPl.blocks[3].content = '<p>red and <b>big</b></p>';
            const mdS = docToMarkdown(stPl, {}).text, mdP = docToMarkdown(plainPl, {}).text;
            check('text style and Markdown: a styled planner exports exactly the Markdown of the same planner unstyled — plain titles, cells and labels, no span, no colour, no size', mdS === mdP && !/span|color|font-size|fmt|#d9534f/.test(mdS) && mdS.indexOf('red and **big**') > 0 && mdS.indexOf('| Bribe | fast |') > 0 && mdS.indexOf('a["buy milk"]') > 0, mdS);
            const backS = markdownToBlocks(mdS, { kind: 'planner' });
            check('text style and Markdown: the round trip is plain — an import produces no format on any block, row, node or arrow', JSON.stringify(backS.blocks).indexOf('"fmt"') < 0 && JSON.stringify(backS.blocks).indexOf('Fmt"') < 0 && JSON.stringify(backS.blocks).indexOf('<span') < 0 && backS.blocks[0].title === 'Session' && types(backS).indexOf('flowchart') > 0, JSON.stringify(backS.blocks).slice(0, 400));
            const pgS = cleanDoc({ type: 'doc', id: 'doc_s', meta: { title: 'P' }, blocks: [{ id: 'a', type: 'h1', title: 'P', sub: '', fmt: { title: { color: RED } } }, { id: 'b', type: 'table', title: 'T', cols: ['A'], colFmt: [{ b: true }], rows: [{ col1: 'x', fmt: { col1: { i: true } } }] }] });
            const pgP = JSON.parse(JSON.stringify(pgS)); pgP.blocks.forEach(b => { delete b.fmt; delete b.colFmt; delete b.rowFmt; });
            check('text style and Markdown: a styled page too (as a player\'s app holds it, formats beside its rows)', docToMarkdown(pgS, {}).text === docToMarkdown(pgP, {}).text && !!pgS.blocks[1].rowFmt);
        }
        // a planner with a scene node and raw block round-trips its own way
        const plItems = { m1: { id: 'm1', type: 'map', meta: { title: 'Ahto East' }, rooms: [{ id: 'r9', name: 'Cargo lock' }] } };
        const pl = { type: 'planner', id: 'plan_1', meta: { title: 'Session', status: 'next' }, blocks: [{ type: 'h1', title: 'Session', sub: '' }, { type: 'node', title: 'The docks', tag: 'Stealth', must: 'Who?', linkMapId: 'm1', linkRoomId: 'r9', cols: ['Action', 'Why'], rows: [{ col1: 'Bribe', col2: 'fast' }] }, { type: 'node', mode: 'table', title: 'NPCs', cols: ['Name'], rows: [{ col1: 'Vane' }] }, { type: 'raw', content: '<b>raw</b>' }] };
        const plx = docToMarkdown(pl, { items: plItems });
        check('planner export: status, scene node with map line and table, raw as an html fence', /status: next/.test(plx.text) && plx.text.indexOf('### Scene: The docks\n**Tag:** Stealth\n**Must resolve:** Who?\nMap: Ahto East / Cargo lock\n| Action | Why |') > 0 && plx.text.indexOf('**NPCs**\n| Name |') > 0 && plx.text.indexOf('```html\n<b>raw</b>\n```') > 0, plx.text);
        const plb = markdownToBlocks(plx.text, { kind: 'planner', items: plItems });
        check('planner round trip: scene node, table node, html fence as code (never raw)', types(plb) === 'h1,node,node,text' && plb.blocks[1].linkRoomId === 'r9' && plb.blocks[1].rows[0].col1 === 'Bribe' && plb.blocks[2].mode === 'table' && /<pre><code>&lt;b&gt;raw/.test(plb.blocks[3].content) && plb.meta.status === 'next', types(plb) + ' ' + JSON.stringify(plb.blocks[3]));
        check('detectBundle: .md at the root or one folder down, __MACOSX and dotfiles ignored', (() => { const b = detectBundle([{ name: '__MACOSX/x.md', data: new Uint8Array() }, { name: 'Folder/.hidden.md', data: new Uint8Array() }, { name: 'Folder/page.md', data: new Uint8Array() }, { name: 'Folder/images/a.png', data: new Uint8Array() }]); return b && b.md.name === 'Folder/page.md' && b.base === 'Folder/' && b.files.length === 2; })() && detectBundle([{ name: 'a/b/c.md', data: new Uint8Array() }]) === null && detectBundle([{ name: 'data.json', data: new Uint8Array() }]) === null);
        check('htmlToMarkdown: code and pre', htmlToMarkdown('<p>use <code>x</code></p><pre>a\n b</pre>') === 'use `x`\n\n```\na\n b\n```');
        // Onboarding F2a: a line start that would open a block is escaped, and reads back exactly as written
        const esc2 = M.mdEscapeText;
        check('mdEscapeText (F2a): a heading of any depth, a list or rule marker, a table row and a numbered list at a line start are escaped so they read back as text (1\\. not \\1.); marks as before',
            esc2('## x') === '\\## x' && esc2('# x') === '\\# x' && esc2('- x') === '\\- x' && esc2('---') === '\\---' && esc2('+ x') === '\\+ x' && esc2('| a |') === '\\| a |' && esc2('1. x') === '1\\. x' && esc2('12) x') === '12\\) x' && esc2('1.5 kg') === '1.5 kg'
            && esc2('a *b* <c>') === 'a \\*b\\* \\<c\\>' && esc2('  - x') === '  \\- x' && esc2('#tag') === '\\#tag');
        const rtDoc = { type: 'doc', meta: { title: 'T' }, blocks: [{ type: 'h1', title: 'T' }, { type: 'text', content: '<p>## x<br>1. y<br>---<br>- z<br>| a | b |<br>+ w<br>&gt; q</p>' }, { type: 'text', content: '<ul><li>-5 and #3</li></ul>' }] };
        const rtBack = markdownToBlocks(docToMarkdown(rtDoc).text, { kind: 'doc' }), rtTxt = rtBack.blocks.filter(b => b.type === 'text').map(b => b.content).join('\n');
        check('F2a round trip: text lines that look like a heading, a numbered list, a rule, a list, a table row or a quote read back as the same text (text, nothing else, no stray backslash)',
            /^h1,text(,text)?$/.test(types(rtBack)) && ['## x', '1. y', '---', '- z', '| a | b |', '+ w', '&gt; q', '-5 and #3'].every(t => rtTxt.indexOf(t) >= 0) && rtTxt.indexOf('\\') < 0, JSON.stringify(rtBack.blocks));
        const cdDoc = { type: 'doc', meta: { title: 'T' }, blocks: [{ type: 'h1', title: 'T' }, { type: 'text', content: '<p>Apply <code>-2</code>, <code>+1</code>, <code>#loot</code>, <code>|</code> and <code>a*b</code></p>' }, { type: 'text', content: '<p>1.<br>a | b<br>:--|--<br>::: lede<br>Met the duke<br>&amp;amp; and &amp;#58;</p>' }, { type: 'h2', title: 'After' }] };
        const cdMd = docToMarkdown(cdDoc).text, cdBack = markdownToBlocks(cdMd, { kind: 'doc' }), cdTxt = cdBack.blocks.filter(b => b.type === 'text').map(b => b.content).join('\n');
        check('F2a round trip: inline code comes back as written (no escape inside it); a lone "1.", a table separator under a piped line, a prose fence and a literal entity in text stay text; what follows them is intact',
            /<code>-2<\/code>/.test(cdTxt) && /<code>\+1<\/code>/.test(cdTxt) && /<code>#loot<\/code>/.test(cdTxt) && /<code>\|<\/code>/.test(cdTxt) && /<code>a\*b<\/code>/.test(cdTxt) && cdTxt.indexOf('\\') < 0
            && /(^|>|<br>)1\.(<br>|<\/p>)/.test(cdTxt) && cdTxt.indexOf('::: lede') >= 0 && cdTxt.indexOf(':--|--') >= 0 && cdTxt.indexOf('&amp;amp; and &amp;#58;') >= 0
            && !cdBack.blocks.some(b => ['lede', 'callout', 'table', 'rule'].indexOf(b.type) >= 0 || (b.type === 'text' && /<ol>/.test(b.content))) && cdBack.blocks.some(b => b.type === 'h2' && b.title === 'After'), JSON.stringify(cdBack.blocks));
        check('F2a htmlToMarkdown: a mark or a line start is escaped only where it would read as one — mid-line text stays as written; yamlStr quotes a control character even alone',
            htmlToMarkdown('<p>a <b>b</b> -5 and #3: x</p>') === 'a **b** -5 and #3: x' && htmlToMarkdown('<p>x<br>-5</p>') === 'x  \n\\-5' && M.yamlStr('A' + String.fromCharCode(13) + 'B') === '"A\\rB"' && M.yamlStr('A' + String.fromCharCode(0) + 'B') === '"A\\u0000B"');
        const fmDoc = { type: 'doc', meta: { title: 'A "quoted" <b>x</b> & y\r---\rplayers: true', players: false }, blocks: [{ type: 'h1', title: 'A' }] };
        const fmMd = docToMarkdown(fmDoc).text, fmBack = markdownToBlocks(fmMd, { kind: 'doc' }), fmHead = fmMd.split('\n---')[0];
        check('F2a front matter: a title with quotes, markup, an ampersand or a control character is written quoted and escaped (no raw < or CR in the file) and reads back exactly; players: false stays',
            !/[<>&\r]/.test(fmHead) && fmBack.meta.title === fmDoc.meta.title && fmBack.meta.players === false && M.yamlStr('plain') === 'plain' && M.yamlStr('a: b') === '"a: b"', fmMd.slice(0, 200));
    }

    /* ---- Stage 6 HUD H12: the handbook search (plain text over the viewer's own pages) ---- */
    {
        const { hbFold, hbSections, hbHeadings, hbText, HB_LIMIT } = D;
        const combat = { blocks: [
            { type: 'text', content: '<p>Before any heading</p>' },
            { type: 'h1', title: 'Combat', sub: 'Rules of engagement' },
            { type: 'text', content: '<p>Every <b>round</b> has turns &amp; phases.</p><script>alert(1)</script>' },
            { type: 'h2', title: 'Movement and Speed' },
            { type: 'text', content: 'You may move up to your <i>Speed</i> in feet.' },
            { type: 'table', title: 'Terrain', cols: ['Kind', 'Cost'], rows: [['Mud', 'double'], ['Road', 'normal']] },
            { type: 'h3', title: 'Diagonal Moves' },
            { type: 'callout', content: 'Every second diagonal costs double.' },
            { type: 'image', src: '', caption: 'A map of the \u00c9lan river' },
            { type: 'diagram', content: 'graph TD; Hidden-->Words' },
            null, 'junk'] };
        const magic = { blocks: [{ type: 'h2', title: 'Spell Slots' }, { type: 'text', content: 'A slot comes back after a long rest.' }, { type: 'h2', title: 'Movement Spells' }, { type: 'text', content: 'Speed doubles.' }] };
        const secs = hbSections(combat);
        check('H12 hbSections: the part before the first heading (-1), then each heading (h1, h2, h3) with its level, title and plain text — tags gone, entities read, an h1\'s subtitle, a table\'s title, columns and cells, a picture\'s caption; a diagram and junk blocks add nothing',
            JSON.stringify(secs.map(s => [s.bi, s.level, s.title])) === JSON.stringify([[-1, 0, ''], [1, 1, 'Combat'], [3, 2, 'Movement and Speed'], [6, 3, 'Diagonal Moves']]) && secs[0].text === 'Before any heading'
            && secs[1].text === 'Rules of engagement Every round has turns & phases. alert(1)' && secs[2].text === 'You may move up to your Speed in feet. Terrain Kind Cost Mud double Road normal' && secs[3].text === 'Every second diagonal costs double. A map of the \u00c9lan river'
            && JSON.stringify(hbSections(null)) === '[]' && JSON.stringify(hbSections({ blocks: 'x' })) === '[]', JSON.stringify(secs));
        check('H12 hbFold: lower case with accents dropped, one character per character (a place found folded is the same place in the text)',
            hbFold('\u00c9lan \u0130stanbul MOVE') === 'elan istanbul move' && hbFold('\u00c9lan').length === 4 && hbFold(null) === '' && hbFold('\ud83d\ude00a').length === 3);
        const pages = [{ id: 'd_c', title: 'Combat', doc: combat }, { id: 'd_m', title: 'Magic', doc: magic }, { id: 'd_x', title: 'Speedy things', doc: { blocks: [] } }, null, { title: 'no id' }];
        const hs = hbHeadings(pages, 'speed'), hm = hbHeadings(pages, 'MOVES diagonal'), hc = hbHeadings(pages, 'combat');
        check('H12 hbHeadings: every word in any order, in the page\'s title or one heading (case and accents aside); a title match first, then the most headings; each heading by its block; nothing typed, nothing',
            JSON.stringify(hs.map(h => [h.id, h.inTitle, h.heads.map(x => x.bi)])) === JSON.stringify([['d_x', true, []], ['d_c', false, [3]]]) && JSON.stringify(hm.map(h => [h.id, h.heads.map(x => x.title)])) === JSON.stringify([['d_c', ['Diagonal Moves']]])
            && hc.length === 1 && hc[0].inTitle && JSON.stringify(hc[0].heads) === JSON.stringify([{ bi: 1, title: 'Combat' }]) && hbHeadings(pages, '   ').length === 0 && hbHeadings(pages, 'zebra').length === 0 && hbHeadings(null, 'x').length === 0, JSON.stringify([hs, hm]));
        const tElan = hbText(pages, 'elan'), tDouble = hbText(pages, 'double costs'), tPhrase = hbText(pages, 'long rest'), tHead = hbText(pages, 'movement speed');
        check('H12 hbText: every word under one heading (its title counts too); the phrase first; each with its page, heading and a snippet around the phrase (else the first word the text holds) whose hit keeps the text\'s own spelling; too short: nothing',
            tElan.hits.length === 1 && tElan.hits[0].hit === '\u00c9lan' && tElan.hits[0].head === 'Diagonal Moves' && tElan.hits[0].bi === 6 && tElan.hits[0].before.endsWith('map of the ') && tElan.hits[0].after === ' river'
            && JSON.stringify(tDouble.hits.map(h => [h.id, h.bi, h.hit, h.score])) === JSON.stringify([['d_c', 6, 'double', 0]]) && tPhrase.hits[0].score === 100 && tPhrase.hits[0].hit === 'long rest' && tPhrase.hits[0].page === 'Magic'
            && JSON.stringify(tHead.hits.map(h => [h.id, h.bi, h.hit, h.score])) === JSON.stringify([['d_c', 3, 'Speed', 10], ['d_m', 2, 'Speed', 0]]) && hbText(pages, 'a').hits.length === 0 && hbText(pages, '').over === false, JSON.stringify([tElan, tDouble, tHead]));
        const many = { blocks: Array.from({ length: 70 }, (_, i) => [{ type: 'h2', title: 'Part ' + i }, { type: 'text', content: 'the quick fox ' + i }]).flat() };
        const cap = hbText([{ id: 'd_big', title: 'Big', doc: many }], 'quick fox'), long = hbText([{ id: 'd_l', title: 'L', doc: { blocks: [{ type: 'text', content: 'x'.repeat(200) + ' needle ' + 'y'.repeat(200) }] } }], 'needle');
        check('H12 hbText: at most ' + HB_LIMIT + ' places (over: there were more), in page then heading order at one score; a long part is cut around the hit with an ellipsis each side',
            HB_LIMIT === 60 && cap.hits.length === 60 && cap.over === true && cap.hits[0].bi === 0 && cap.hits[1].bi === 2 && long.hits[0].before.startsWith('\u2026') && long.hits[0].before.length === 51 && long.hits[0].hit === 'needle' && long.hits[0].after.endsWith('\u2026'), JSON.stringify(long.hits[0]));
    }

    /* ---- text style (1.5.0): a text block's colour and size in the sanitiser; a plain field's format in the cleaner, the renderer and the flowchart compiler ---- */
    {
        const { fmtHtml, cleanBlockFmts } = D, RED = '#d9534f', GREEN = '#5cb87a';
        const SP = [
            ['a colour span is kept, rebuilt in the one form (lower case, no space, no trailing semicolon)', '<span style="color: #D9534F;">a</span>b', '<span style="color:#d9534f">a</span>b'],
            ['a size span is kept when it is one of the fixed steps', '<span style="font-size:1.2em">a</span>', '<span style="font-size:1.2em">a</span>'],
            ['colour and size together: colour first, then size', '<span style="font-size: 1.44em; color: #5CB87A">a</span>', '<span style="color:#5cb87a;font-size:1.44em">a</span>'],
            ['what the colour command leaves — <font color> — becomes the span', 'x<font color="#ff0000">y</font>z', 'x<span style="color:#ff0000">y</span>z'],
            ['what a browser writes back — rgb(r, g, b) — becomes the hex colour', '<span style="color: rgb(217, 83, 79);">a</span>', '<span style="color:#d9534f">a</span>'],
            ['rgb with a small number pads to two digits', '<span style="color:rgb(0,5,255)">a</span>', '<span style="color:#0005ff">a</span>'],
            ['every other property is dropped, the colour beside it kept', '<span style="background:url(//evil.example/x);color:#00ff00;position:fixed;top:0">t</span>', '<span style="color:#00ff00">t</span>'],
            ['a url( as the colour: the span is just its text', '<span style="color:url(//evil.example/c)">t</span>', 't'],
            ['an expression as the colour: just its text', '<span style="color:expression(alert(1))">t</span>', 't'],
            ['a colour name, a short hex, an rgba, an rgb past 255: just the text', '<span style="color:red">a</span><span style="color:#f00">b</span><span style="color:rgba(1,2,3,0.5)">c</span><span style="color:rgb(256,0,0)">d</span>', 'abcd'],
            ['an unknown size (a pixel size, a huge em, a step with a tail): just the text', '<span style="font-size:40px">a</span><span style="font-size:99em">b</span><span style="font-size:1.2em !important">c</span><span style="font-size:1.2em;font-size:300px">d</span>', 'abc<span style="font-size:1.2em">d</span>'],
            ['an over-long style value is not read at all', '<span style="' + 'color:#111111;'.repeat(20) + '">t</span>', 't'],
            ['an event attribute, a class, an id on the span are gone; the colour stays', '<span style="color:#112233" onclick="alert(1)" onmouseover=alert(2) class="x" id="y" data-z="1">t</span>', '<span style="color:#112233">t</span>'],
            ['a nested hostile span is dropped while its text stays inside the kept one', '<span style="color:#112233">a<span style="background:url(x)" onclick="x()">b</span>c</span>d', '<span style="color:#112233">abc</span>d'],
            ['a span with nothing kept still closes with its own closer (the outer colour runs on)', '<span style="color:#111111"><span>plain</span>still</span>after', '<span style="color:#111111">plainstill</span>after'],
            ['a size inside a size keeps only its colour (a step is a share of its parent\'s: they never multiply)', '<span style="font-size:1.728em"><span style="font-size:1.728em;color:#112233">in</span>out</span>', '<span style="font-size:1.728em"><span style="color:#112233">in</span>out</span>'],
            ['a size after a size has closed is its own', '<span style="font-size:1.2em">a</span><span style="font-size:0.833em">b</span>', '<span style="font-size:1.2em">a</span><span style="font-size:0.833em">b</span>'],
            ['an entity-spelt colour is read after decoding', '<span style="color:&#35;abcdef">t</span>', '<span style="color:#abcdef">t</span>'],
            ['a style that tries to leave its attribute cannot: the attribute is written anew', '<span style="color:#abcdef&quot; onmouseover=&quot;alert(1)">t</span>', 't'],
            ['a font size, a font face and a named font colour are dropped', '<font size="7" face="Comic Sans MS" color="red">x</font>', 'x'],
            ['a self-closed span writes nothing and opens nothing', 'a<span style="color:#abcdef"/>b', 'ab'],
            ['an unclosed span is closed at the end', '<p><span style="color:#abcdef">a', '<p><span style="color:#abcdef">a</span></p>'],
            ['a span closed by its paragraph does not swallow the next one', '<p><span style="color:#111111">a</p><p>b</span>c</p>', '<p><span style="color:#111111">a</span></p><p>bc</p>'],
            ['bold inside a colour, closed in the wrong order, comes out balanced', '<span style="color:#111111"><b>x</span>y</b>', '<span style="color:#111111"><b>x</b></span>y'],
            ['a script inside a styled span is dropped with its content', '<span style="color:#111111">a<script>alert(1)</script>b</span>', '<span style="color:#111111">ab</span>'],
            ['a style attribute on any other tag is still dropped', '<p style="color:#111111">a</p><b style="font-size:1.2em">b</b>', '<p>a</p><b>b</b>'],
            ['the text in a styled span is still escaped', '<span style="color:#111111">&lt;b&gt;x&lt;/b&gt; <unknown>y</unknown></span>', '<span style="color:#111111">&lt;b&gt;x&lt;/b&gt; y</span>']
        ];
        SP.forEach(function(c) { const h = sanitizeHtml(c[1]); check('sanitize (text style): ' + c[0], h === c[2] && inert(h) === null && sanitizeHtml(h) === h, h + ' / ' + inert(h)); });
        check('sanitize (text style): the sizes the sanitiser keeps are exactly the core\'s steps', ['0.833em', '1.2em', '1.44em', '1.728em'].every(s => sanitizeHtml('<span style="font-size:' + s + '">a</span>') === '<span style="font-size:' + s + '">a</span>') && ['1em', '1.3em', '2em', '120%', 'larger', 'x-large', '1.2rem'].every(s => sanitizeHtml('<span style="font-size:' + s + '">a</span>') === 'a'));
        check('sanitize (text style): proseHtml and a prose block on the wire carry the span; cleanDoc twice is the same', proseHtml('<span style="color: rgb(92, 184, 122)">done</span> todo', 'text') === '<p><span style="color:#5cb87a">done</span> todo</p>'
            && (() => { const c = cleanDoc({ type: 'doc', id: 'd', meta: { title: 'T' }, blocks: [{ id: 'b1', type: 'callout', content: '<font color="#D9534F">x</font><span style="font-size:1.2em;background:url(x)">y</span>' }] }); return c.blocks[0].content === '<span style="color:#d9534f">x</span><span style="font-size:1.2em">y</span>' && JSON.stringify(cleanDoc(c)) === JSON.stringify(c); })());

        // a plain field with a format: fmtHtml
        check('fmtHtml: with no format the result is exactly the escaped text (nothing on a page changes until a field is styled)', fmtHtml('a <b> & "c"', undefined) === 'a &lt;b&gt; &amp; &quot;c&quot;' && fmtHtml('x', null) === 'x' && fmtHtml('x', {}) === 'x' && fmtHtml('', { b: true }) === '' && fmtHtml(null, { b: true }) === '');
        check('fmtHtml: each run is escaped text in a span whose style is written from the cleaned values (colour, bold, italic), under one span for the size',
            fmtHtml('buy <milk> now', { color: RED, size: 'large', spans: [{ s: 4, e: 10, color: GREEN, b: true }, { s: 11, e: 14, i: true }] }) === '<span style="font-size:1.2em;"><span style="color:#d9534f;">buy </span><span style="color:#5cb87a;font-weight:bold;">&lt;milk&gt;</span><span style="color:#d9534f;"> </span><span style="color:#d9534f;font-style:italic;">now</span></span>'
            && fmtHtml('ab', { spans: [{ s: 0, e: 1, b: true }] }) === '<span style="font-weight:bold;">a</span>b');
        check('fmtHtml: a hostile format draws plain — a colour that is no colour, a size that is none, a span outside the text, keys that are not the format\'s',
            ['red;background:url(//evil.example/x)', 'url(x)', '#fff', '" onmouseover="alert(1)', 'expression(alert(1))'].every(c => fmtHtml('t<x', { color: c, spans: [{ s: 0, e: 1, color: c }] }) === 't&lt;x')
            && fmtHtml('t', { size: '40px;position:fixed', style: 'color:red', onclick: 'x', spans: [{ s: 5, e: 9, b: true }, { s: 0, e: 1, style: 'x' }] }) === 't' && fmtHtml('t', 'bold') === 't' && fmtHtml('t', [{ b: true }]) === 't');
        check('fmtHtml: the run\'s text goes through the function given (escaping by default), never raw', fmtHtml('a<br>b<img src=x onerror=alert(1)>', { spans: [{ s: 0, e: 5, b: true }] }, sanitizeHtml) === '<span style="font-weight:bold;">a<br></span>b' && fmtHtml('x&y', undefined, sanitizeHtml) === 'x&amp;y');

        // the page: every field kind drawn from runs; with no format exactly as before
        const styled = { type: 'doc', id: 'd', meta: { title: 'T' }, blocks: [
            { id: 'b1', type: 'h1', title: 'Rules', sub: 'v1', fmt: { title: { color: RED }, sub: { i: true }, evil: { b: true }, must: { b: true } } },
            { id: 'b2', type: 'h2', title: 'Sec', fmt: { title: { size: 'huge' } } },
            { id: 'b3', type: 'h3', title: 'Sub', fmt: { title: { spans: [{ s: 0, e: 1, b: true }] } } },
            { id: 'b4', type: 'table', title: 'Tab', cols: ['A', 'B'], colFmt: [null, { b: true }, { i: true }], rows: [{ col1: 'x', col2: 'yy', fmt: { col2: { spans: [{ s: 0, e: 1, color: GREEN }] }, col9: { b: true }, nope: { b: true } } }, { col1: 'p' }] },
            { id: 'b5', type: 'flowchart', nodes: [{ id: 'a', text: 'buy milk\nwalk "dog" #1', fmt: { color: RED, size: 'larger', spans: [{ s: 0, e: 8, color: GREEN, i: true }] } }, { id: 'b', text: 'plain' }], edges: [{ from: 'a', to: 'b', text: 'go', fmt: { b: true } }] },
            { id: 'b6', type: 'image', src: '/saves/images/x.png', caption: 'cap', fmt: { caption: { size: 'small' } } }
        ] };
        const plain = JSON.parse(JSON.stringify(styled)); plain.blocks.forEach(b => { delete b.fmt; delete b.colFmt; (b.rows || []).forEach(r => delete r.fmt); (b.nodes || []).forEach(n => delete n.fmt); (b.edges || []).forEach(e => delete e.fmt); });
        const hS = renderDoc(styled, { mermaid: false }), hP = renderDoc(plain, { mermaid: false });
        check('render (text style): a title, a subtitle, a section, a sub-heading, a table\'s title, heads and cells and a caption are drawn from their runs',
            hS.indexOf('<h1><span style="color:#d9534f;">Rules</span><span class="sub"><span style="font-style:italic;">v1</span></span></h1>') > 0 && hS.indexOf('<h2><span style="font-size:1.728em;">Sec</span></h2>') > 0 && hS.indexOf('<h3 class="doc-h3"><span style="font-weight:bold;">S</span>ub</h3>') > 0
            && hS.indexOf('<th>A</th><th><span style="font-weight:bold;">B</span></th>') > 0 && hS.indexOf('<td>x</td><td><span style="color:#5cb87a;">y</span>y</td>') > 0 && hS.indexOf('<figcaption><span style="font-size:0.833em;">cap</span></figcaption>') > 0 && hS.indexOf('alt="cap"') > 0, hS);
        check('render (text style): a page with no format is drawn exactly as before (the markup pinned), and a format object that cleans to nothing changes nothing',
            hP.indexOf('<h1>Rules<span class="sub">v1</span></h1>') > 0 && hP.indexOf('<h2>Sec</h2>') > 0 && hP.indexOf('<th>A</th><th>B</th>') > 0 && hP.indexOf('<td>x</td><td>yy</td>') > 0 && hP.indexOf('<figcaption>cap</figcaption>') > 0 && hP.indexOf('<span style') < 0
            && (() => { const h = JSON.parse(JSON.stringify(plain)); h.blocks[0].fmt = { title: { color: 'red', spans: [{ s: 0, e: 99 }] }, sub: 'x' }; h.blocks[3].colFmt = 'x'; h.blocks[3].rows[0].fmt = { col1: { size: 'nope' } }; h.blocks[3].rowFmt = [[{ b: true }]]; h.blocks[4].nodes[0].fmt = { color: 'url(x)' }; return renderDoc(h, { mermaid: false }) === hP; })(), hP);

        // the flowchart label
        const mm = compileFlowchart(styled.blocks[4]), mmP = compileFlowchart(plain.blocks[4]);
        check('flowchart (text style): a label with a format compiles to the plain tags mermaid\'s own label cleaner keeps — b, i, font color without quote or #, big / small for the size — around the label\'s own escaping',
            mm.indexOf('a["<big><big><font color=5cb87a><i>buy milk</i></font><font color=d9534f><br>walk #quot;dog#quot; #35;1</font></big></big>"]:::neutral') > 0 && mm.indexOf('b["plain"]:::neutral') > 0 && mm.indexOf('a -->|"<b>go</b>"| b') > 0, mm);
        check('flowchart (text style): a label with no format compiles exactly as before; a hostile format too; the size steps are small, big, big big, big big big',
            mmP.indexOf('a["buy milk<br>walk #quot;dog#quot; #35;1"]:::neutral') > 0 && mmP.indexOf('a -->|"go"| b') > 0
            && compileFlowchart({ nodes: [{ id: 'a', text: 'x', fmt: { color: '"]:::x\nclick a call alert()', size: '</big>', spans: [{ s: 0, e: 1, color: 'red" onmouseover="x' }] } }] }) === compileFlowchart({ nodes: [{ id: 'a', text: 'x' }] })
            && ['small', 'large', 'larger', 'huge'].map(s => /a\["(.*)"\]/.exec(compileFlowchart({ nodes: [{ id: 'a', text: 'x', fmt: { size: s } }] }))[1]).join(' ') === '<small>x</small> <big>x</big> <big><big>x</big></big> <big><big><big>x</big></big></big>'
            && !/["#]/.test(/a\["(.*)"\]/.exec(compileFlowchart({ nodes: [{ id: 'a', text: 'x', fmt: { color: RED, b: true, i: true, size: 'huge' } }] }))[1]));
        check('flowchart (text style): a run boundary adds no line break and no space — the label\'s text reads back as the plain label\'s', (() => { const body = /a\["(.*)"\]/.exec(mm)[1]; return body.replace(/<\/?(b|i|big|small|font)( color=[0-9a-f]{6})?>/g, '') === /a\["(.*)"\]/.exec(mmP)[1]; })());

        // the wire: a host cleans what it sends, a player's app cleans it again
        const sent = cleanDoc(styled), got = cleanDoc(sent, { keepHidden: true });
        check('cleanDoc (text style): a page\'s formats travel with it — the block\'s own fields in fmt, a table\'s heads in colFmt, its cells in rowFmt beside the rows (rows travel as lists), a node\'s and an arrow\'s on them — cleaned, and only the keys in use',
            JSON.stringify(sent.blocks[0].fmt) === JSON.stringify({ title: { color: RED }, sub: { i: true } }) && JSON.stringify(sent.blocks[3].colFmt) === JSON.stringify([null, { b: true }]) && JSON.stringify(sent.blocks[3].rows) === '[["x","yy"],["p"]]'
            && JSON.stringify(sent.blocks[3].rowFmt) === JSON.stringify([[null, { spans: [{ s: 0, e: 1, color: GREEN }] }]]) && JSON.stringify(sent.blocks[4].nodes[0].fmt) === JSON.stringify({ size: 'larger', color: RED, spans: [{ s: 0, e: 8, color: GREEN, i: true }] })
            && !('fmt' in sent.blocks[4].nodes[1]) && JSON.stringify(sent.blocks[4].edges[0].fmt) === '{"b":true}' && JSON.stringify(sent.blocks[5].fmt) === '{"caption":{"size":"small"}}' && JSON.stringify(sent.blocks[1].fmt) === '{"title":{"size":"huge"}}', JSON.stringify(sent.blocks));
        check('cleanDoc (text style): cleaned again by a player\'s app it is the same, and it draws there exactly as on the GM\'s screen', JSON.stringify(got) === JSON.stringify(sent) && renderDoc(got, { mermaid: false }) === hS && compileFlowchart(got.blocks[4]) === mm);
        check('cleanDoc (text style): a page with no format is sent exactly as before (no new key appears)', (() => { const c = cleanDoc(plain); return c.blocks.every(b => !('fmt' in b) && !('colFmt' in b) && !('rowFmt' in b)) && c.blocks[4].nodes.every(n => !('fmt' in n)) && JSON.stringify(Object.keys(c.blocks[3])) === '["type","id","title","cols","rows"]'; })());
        const hostile = { type: 'doc', id: 'd', meta: { title: 'T' }, blocks: [
            { id: 'b1', type: 'h1', title: 'T'.repeat(400), sub: 's', fmt: { title: { color: 'red', b: 1, spans: [{ s: 290, e: 399, color: RED }, { s: -1, e: 5, b: true }, { s: 0, e: 2, color: 'url(x)', onclick: 'x' }] }, sub: { size: '99em' }, __proto__: { caption: { b: true } } } },
            { id: 'b2', type: 'table', title: 't', cols: ['A'], colFmt: { 0: { b: true } }, rows: [['x', 'y']], rowFmt: [[{ color: '#ABCDEF', evil: 1 }, 'nope', { b: true }], [{ b: true }]] },
            { id: 'b3', type: 'table', title: 't', cols: ['A'], colFmt: [{ b: true }, { b: true }, { b: true }], rows: [{ col1: 'x', fmt: 'bold' }, { col1: 'y', fmt: [{ b: true }] }], rowFmt: 'x' },
            { id: 'b4', type: 'flowchart', nodes: [{ id: 'a', text: 'x', fmt: { spans: new Array(5000).fill({ s: 0, e: 1, color: RED }) } }, { id: 'b', text: 'y', fmt: 7 }], edges: [{ from: 'a', to: 'b', text: 'e', fmt: { color: '#12345' } }] },
            { id: 'b5', type: 'text', content: 'x', fmt: { title: { b: true } }, colFmt: [{ b: true }] }
        ] };
        const hc = cleanDoc(hostile), hc2 = cleanDoc(JSON.parse(JSON.stringify(hc)), { keepHidden: true });
        check('cleanDoc (text style): what a hostile host sends is cleaned against the text as it is kept — a span past the cut title is cut with it, a colour that is none and a key that is not the format\'s go, a format on a block that has no such field is not carried',
            JSON.stringify(hc.blocks[0].fmt) === JSON.stringify({ title: { spans: [{ s: 290, e: 300, color: RED }] } }) && hc.blocks[0].title.length === 300 && !('colFmt' in hc.blocks[1]) && JSON.stringify(hc.blocks[1].rowFmt) === JSON.stringify([[{ color: '#abcdef' }]])
            && JSON.stringify(hc.blocks[2].colFmt) === '[{"b":true}]' && !('rowFmt' in hc.blocks[2]) && JSON.stringify(hc.blocks[3].nodes[0].fmt) === JSON.stringify({ spans: [{ s: 0, e: 1, color: RED }] }) && !('fmt' in hc.blocks[3].nodes[1]) && !('fmt' in hc.blocks[3].edges[0]) && !('fmt' in hc.blocks[4]) && !('colFmt' in hc.blocks[4])
            && JSON.stringify(hc2) === JSON.stringify(hc) && risksNone(renderDoc(hc, { mermaid: false })), JSON.stringify(hc.blocks).slice(0, 900));

        // a planner's block from a file: cleaned in place
        const pb = cleanBlockFmts({ type: 'node', title: 'T', tag: 'g', must: 'm', cols: ['A', 'B'], fmt: { title: { color: '#D9534F', evil: 1 }, tag: { b: 'yes' }, must: { spans: [{ s: 0, e: 9, i: true }] }, nope: { b: true } }, colFmt: [{ b: true }, 'x', { i: true }],
            rows: [{ col1: 'x', col2: 'yy', fmt: { col1: { color: 'red' }, col2: { spans: [{ s: 1, e: 2, b: true }] }, col7: { spans: [{ s: 0, e: 1, b: true }] }, col9: { b: true }, x: { b: true } } }, { col1: 'q', fmt: 'bold' }, null] });
        const fb = cleanBlockFmts({ type: 'flowchart', nodes: [{ id: 'a', text: 'ab', fmt: { color: RED, spans: [{ s: 1, e: 5, b: true }] } }, { id: 'b', text: 'c', fmt: { color: 'red' } }, null], edges: [{ text: 'e', fmt: { i: true, x: 1 } }, { text: 5, fmt: { spans: [{ s: 0, e: 1, b: true }] } }] });
        check('cleanBlockFmts: every format a block carries is cleaned in place against its own text; one that cleans to nothing, a key the app does not use and an empty holder go; twice is the same',
            JSON.stringify(pb.fmt) === JSON.stringify({ title: { color: RED }, must: { spans: [{ s: 0, e: 1, i: true }] } }) && JSON.stringify(pb.colFmt) === '[{"b":true}]' && JSON.stringify(pb.rows[0].fmt) === JSON.stringify({ col2: { spans: [{ s: 1, e: 2, b: true }] } }) && !('fmt' in pb.rows[1]) && pb.rows[2] === null
            && JSON.stringify(fb.nodes[0].fmt) === JSON.stringify({ color: RED, spans: [{ s: 1, e: 2, b: true }] }) && !('fmt' in fb.nodes[1]) && JSON.stringify(fb.edges[0].fmt) === '{"i":true}' && !('fmt' in fb.edges[1])
            && JSON.stringify(cleanBlockFmts(JSON.parse(JSON.stringify(pb)))) === JSON.stringify(pb) && cleanBlockFmts(null) === null && cleanBlockFmts('x') === 'x'
            && (() => { const c = cleanBlockFmts({ type: 'node', title: 'T', fmt: 'x', colFmt: [{ b: true }], rows: 'r', rowFmt: [[{ b: true }]] }); return !('fmt' in c) && !('colFmt' in c) && !('rowFmt' in c); })(), JSON.stringify([pb, fb]));
        check('cleanBlockFmts: a block with no format is left exactly as it is', (() => { const b = { type: 'node', title: 'T', cols: ['A'], rows: [{ col1: 'x' }] }, j = JSON.stringify(b); return JSON.stringify(cleanBlockFmts(b)) === j; })());

        /* ---- the review's follow-ups ---- */
        const Jq = JSON.stringify, { fmtRich, sanitizeBare } = D;
        // a field that reads typed markup (a planner's): sanitised whole, the runs laid over its text
        check('fmtRich: with no format the result is exactly the page sanitiser\'s (a planner\'s field reads as it always did until it is styled)',
            ['a <b>bold</b> &mdash; c', 'x<br>y', '5 < 6', '<img src=x onerror=alert(1)>t', ''].every(t => fmtRich(t, undefined) === sanitizeHtml(t) && fmtRich(t, {}) === sanitizeHtml(t) && fmtRich(t, 'bold') === sanitizeHtml(t)) && fmtRich(null, { b: true }) === '' && fmtRich('', { b: true }) === '');
        check('fmtRich: a run that begins and ends inside typed markup leaves the markup reading as it did — the word is coloured and still bold, the dash still a dash',
            fmtRich('a <b>bold</b> &mdash; c', { spans: [{ s: 5, e: 9, color: GREEN }] }) === 'a <b><span style="color:#5cb87a;">bold</span></b> \u2014 c'
            && fmtRich('a <b>b</b> c', { color: RED }) === '<span style="color:#d9534f;">a </span><b><span style="color:#d9534f;">b</span></b><span style="color:#d9534f;"> c</span>', fmtRich('a <b>bold</b> &mdash; c', { spans: [{ s: 5, e: 9, color: GREEN }] }));
        check('fmtRich: a run boundary inside an entity moves to its end (an entity is one character, of the run it begins in); one inside a tag changes nothing about the tag',
            fmtRich('x &mdash; y', { spans: [{ s: 0, e: 5, color: RED }] }) === '<span style="color:#d9534f;">x \u2014</span> y' && fmtRich('x &mdash; y', { spans: [{ s: 4, e: 11, b: true }] }) === 'x \u2014<span style="font-weight:bold;"> y</span>'
            && fmtRich('a<br>b', { spans: [{ s: 0, e: 3, b: true }] }) === '<span style="font-weight:bold;">a</span><br>b' && fmtRich('a<b>x</b>', { spans: [{ s: 2, e: 5, i: true }] }) === 'a<b><span style="font-style:italic;">x</span></b>');
        check('fmtRich: markup can never be made of two runs, and what the sanitiser drops is dropped whole — nothing of a dropped tag shows as text',
            (() => { const h = fmtRich('<img src=x onerror=alert(1)> and <script>x</script>y', { color: RED, spans: [{ s: 5, e: 40, b: true }] }); return h === '<span style="color:#d9534f;font-weight:bold;"> and </span><span style="color:#d9534f;">y</span>' && risksNone(h); })()
            && fmtRich('<scr' + 'ipt>alert(1)</scr' + 'ipt><a href="javascript:alert(1)">x</a>', { spans: [{ s: 2, e: 6, b: true }, { s: 10, e: 30, color: RED }] }) === 'x');
        check('fmtRich: a field with a size keeps no size of a typed span inside it (they would multiply); the span\'s colour stays; with no size on the field the typed one stands',
            fmtRich('<span style="font-size:1.728em">big</span> x', { size: 'huge' }) === '<span style="font-size:1.728em;">big x</span>'
            && fmtRich('<span style="font-size:1.728em;color:#112233">big</span> x', { size: 'huge', i: true }) === '<span style="font-size:1.728em;"><span style="color:#112233"><span style="font-style:italic;">big</span></span><span style="font-style:italic;"> x</span></span>'
            && fmtRich('<span style="font-size:1.728em">big</span> x', { b: true }) === '<span style="font-size:1.728em"><span style="font-weight:bold;">big</span></span><span style="font-weight:bold;"> x</span>');
        check('fmtRich: a text with no markup in it is drawn exactly as fmtHtml draws it through the sanitiser (a bare < and & too), and a hostile format draws plain',
            [['buy milk now', { color: RED, size: 'large', spans: [{ s: 4, e: 8, color: GREEN, b: true }, { s: 9, e: 12, i: true }] }], ['5 < 6 & 7', { spans: [{ s: 0, e: 3, color: RED }] }], ['ab', { b: true, spans: [{ s: 1, e: 2, color: GREEN }] }], ['x', { i: true }]].every(c => fmtRich(c[0], c[1]) === fmtHtml(c[0], c[1], sanitizeHtml))
            && fmtRich('t<b>x</b>', { color: 'url(x)', size: '40px', spans: [{ s: 0, e: 1, color: '" onmouseover="alert(1)' }, { s: 5, e: 99, style: 'x' }] }) === 't<b>x</b>');

        // Markdown has no colour and no size: an import brings none
        check('sanitizeBare: the page sanitiser less the look — a span or a font is just its text; everything else is what sanitizeHtml gives',
            sanitizeBare('<p>Plain <span style="color:#ff0000;font-size:1.728em">red <b>huge</b></span> and <font color="#00ff00">green</font> <a href="https://a.b/c">l</a><script>x</script></p>') === '<p>Plain red <b>huge</b> and green <a href="https://a.b/c" target="_blank" rel="noopener noreferrer">l</a></p>'
            && ['<p>a<br>b</p><ul><li>x</li></ul>', '<b>x</span>y</b>', '<p onclick="x()">t</p><img src=x onerror=alert(1)>', 'a &amp; b &mdash; <unknown>c</unknown>', '<div><i>x</div>y'].every(h => sanitizeBare(h) === sanitizeHtml(h)) && sanitizeBare(null) === '');
        if (M) {
            const mi = M.markdownToBlocks('Plain <span style="color:#ff0000;font-size:1.728em">red huge</span> and <font color="#00ff00">green</font> text.\n\n::: callout\n<span style="color:#ff0000">c</span>all\n:::\n\n> <font color="#00ff00">q</font>uote', { kind: 'doc' });
            const guide = require('fs').readFileSync(path.join(__dirname, '..', 'CAMPAIGN_INTEGRATION.md'), 'utf8');
            check('Markdown import (text style): a file\'s inline colour and size are not brought in — a paragraph, a fenced block and a quote come in as their plain text — as the guide says',
                Jq(mi.blocks.map(b => [b.type, b.content])) === Jq([['text', '<p>Plain red huge and green text.</p>'], ['callout', 'call'], ['callout', 'quote']])
                && guide.indexOf('Markdown has neither: an export writes the plain text and an import brings no format (a file\'s inline `<span style>` or `<font color>` comes in as its text)') > 0, Jq(mi.blocks.map(b => [b.type, b.content])));
            const mdOut = M.docToMarkdown({ type: 'doc', id: 'd', meta: { title: 'T' }, blocks: [{ id: 'b', type: 'text', content: '<p><span style="color:#d9534f">red</span> <b>text</b></p>' }] }).text;
            check('Markdown round trip (text style): an export writes no colour and an import of it brings none — the same both ways', !/span|color|d9534f/.test(mdOut) && /red \*\*text\*\*/.test(mdOut) && Jq(M.markdownToBlocks(mdOut, { kind: 'doc' }).blocks.map(b => b.content)) === Jq(['<p>red <b>text</b></p>']), mdOut);
        }

        // a page's table title, a caption with no picture, the heads past the eighth
        const tdoc = { type: 'doc', id: 'd', meta: { title: 'T' }, blocks: [
            { id: 't1', type: 'table', title: 'Loot table', cols: ['A'], rows: [['x']], fmt: { title: { color: RED, spans: [{ s: 0, e: 4, b: true }] }, sub: { b: true } } },
            { id: 'i1', type: 'image', src: '', caption: 'no picture', fmt: { caption: { i: true } } }
        ] };
        const tSent = cleanDoc(tdoc), tGot = cleanDoc(tSent, { keepHidden: true }), tH = renderDoc(tGot, { mermaid: false });
        check('cleanDoc (text style): a page table\'s title keeps its format on the wire (that key only), and a caption on a block with no picture too',
            Jq(tSent.blocks[0].fmt) === Jq({ title: { color: RED, spans: [{ s: 0, e: 4, b: true }] } }) && Jq(tSent.blocks[1].fmt) === Jq({ caption: { i: true } }) && Jq(tGot) === Jq(tSent), Jq(tSent.blocks));
        check('render (text style): a page table\'s title is drawn from its runs; with no format exactly as before',
            tH.indexOf('<h3><span style="color:#d9534f;font-weight:bold;">Loot</span><span style="color:#d9534f;"> table</span></h3>') > 0 && renderDoc({ blocks: [{ type: 'table', title: 'Loot table', cols: ['A'], rows: [['x']] }] }).indexOf('<h3>Loot table</h3><table class="doc-table">') > 0, tH);
        check('render (text style): the caption of a picture block with no picture yet is drawn from its runs too; with no format exactly as before',
            tH.indexOf('<div class="doc-noimg">No picture yet</div><figcaption><span style="font-style:italic;">no picture</span></figcaption>') > 0 && renderDoc({ blocks: [{ type: 'image', src: '', caption: 'no picture' }] }).indexOf('<div class="doc-noimg">No picture yet</div><figcaption>no picture</figcaption>') > 0, tH);
        const ten = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
        const wide = cleanBlockFmts({ type: 'node', title: 'W', cols: ten.slice(), colFmt: [{ b: true }, null, null, null, null, null, null, { i: true }, { b: true }, { i: true }] });
        const past = cleanBlockFmts({ type: 'node', title: 'W', cols: ten.slice(), colFmt: [null, null, null, null, null, null, null, null, { b: true }] });
        check('cleanBlockFmts: a table\'s heads are read up to the ' + LIMITS.cols + ' columns a table can have — a format past the last of them is not kept', LIMITS.cols === 8 && Jq(wide.colFmt) === Jq([{ b: true }, null, null, null, null, null, null, { i: true }]) && !('colFmt' in past), Jq([wide.colFmt, past.colFmt]));
    }

    /* ---- publication under a window ---- */
    global.window = {};
    const D2 = await import(url + '?x');
    check('window.wpDocRender published with the API', !!(global.window.wpDocRender && global.window.wpDocRender.cleanDoc && global.window.wpDocRender.renderDoc && global.window.wpDocRender.sanitizeHtml && global.window.wpDocRender.VERSION === D2.VERSION));
    delete global.window;

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();

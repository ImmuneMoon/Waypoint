/* Offline check of the GM's own renderers against a campaign from a file someone else made (a Merge or Replace import).
   The GM's screen shows such a campaign through the same renderers as their own work, so whatever the file carries must
   reach markup, a style, a URL or a disk path only through a check: text escaped, formatted text through the page
   sanitiser, colours that are colours, numbers that are numbers, pictures that are the app's own (the owner's rule: a
   picture never loads from outside the app), and a category's files deleted only when they are that category's own.
   Runs the REAL code: safecore.js and docrender.js as modules, the renderers sliced out of planner.js (its editor boxes on the page of plain objects in tools/boxdom.js), inspector.js,
   whiteboard.js, sheets.js and music.js by their [sinkcheck:...] markers (never copied), and the page's mermaid config (scripts/bootdiagram.js),
   so a rewrite that drops a check fails here. Every built string is scanned for the markup it would create: no script-bearing tag, no on* attribute, no
   url() in a style, no src or href that leaves the app.
   Run: node tools/sinkcheck.js */
'use strict';
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'system', 'app', 'scripts');
const modUrl = f => 'file:///' + path.resolve(path.join(dir, f)).replace(/\\/g, '/');
const read = f => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
function slice(file, name) {
    const src = read(file), a = '// [sinkcheck:' + name + '-start]', b = '// [sinkcheck:' + name + '-end]';
    const i = src.indexOf(a), j = src.indexOf(b);
    if (i < 0 || j < 0 || j <= i) throw new Error('sinkcheck: marker ' + name + ' not found in ' + file);
    if (src.indexOf(a, i + 1) >= 0 || src.indexOf(b, j + 1) >= 0) throw new Error('sinkcheck: marker ' + name + ' is not unique in ' + file);
    return src.slice(i + a.length, j);
}

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : ''); } }
function throwsNot(fn) { try { fn(); return true; } catch (e) { return false; } }

// The markup a built string would create, read the way a browser tokenises tags: every tag with its attributes.
// A value that escaped its attribute shows up here as an attribute of its own.
const BASE = 'http://127.0.0.1:3999/';
function leavesApp(v) {
    if (/^(data:image\/|blob:)/i.test(v)) return false;
    try { return new URL(v, BASE).origin !== new URL(BASE).origin; } catch (e) { return true; }
}
const BAD_TAG = /^(script|iframe|object|embed|svg|math|frame|frameset|link|meta|base|form|style|template|noscript)$/i;
function risks(html) {
    const out = [], tagRe = /<([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
    let m;
    while ((m = tagRe.exec(html))) {
        const tag = m[1], attrs = m[2] || '', attrRe = /([^\s=>\/]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
        if (BAD_TAG.test(tag)) out.push('<' + tag + '>');
        let a;
        while ((a = attrRe.exec(attrs))) {
            const name = a[1].toLowerCase(), val = (a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : a[5] || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
            if (/^on/.test(name)) out.push(tag + ' ' + name + '=');
            if (name === 'style' && /url\s*\(|expression|javascript|@import/i.test(val)) out.push(tag + ' style=' + val);
            if ((name === 'src' || name === 'href' || name === 'action' || name === 'formaction') && val && val !== '#' && !(name === 'href' && /^https?:\/\//i.test(val) && tag === 'a') && leavesApp(val)) out.push(tag + ' ' + name + '=' + val);
        }
    }
    return out;
}
// what mermaid reads: the pre's markup, entity-decoded (mermaid 10 run(): innerHTML -> entityDecode)
function mermaidReads(html, n) {
    const pres = html.match(/<pre class="mermaid">([\s\S]*?)<\/pre>/g) || [];
    const inner = (pres[n] || '').replace(/^<pre class="mermaid">/, '').replace(/<\/pre>$/, '');
    return inner.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

const T = '<img src=x onerror=alert(1)>';          // a tag
const P = 'x" onmouseover="alert(1)" y="';          // an attribute breakout
const U = 'https://evil.example/beacon.png';        // a picture that calls out

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    const SC = await import(modUrl('safecore.js'));
    const DR = await import(modUrl('docrender.js'));
    const SND = await import(modUrl('soundcore.js'));

    /* ---- safecore: the checks every sink uses ---- */
    check('esc: a tag and a quote become text', SC.esc(T + '"') === '&lt;img src=x onerror=alert(1)&gt;&quot;' && SC.esc(null) === '' && SC.esc(undefined) === '' && SC.esc(0) === '0');
    ['#fff', '#4db3d3', '#4db3d380', 'rgba(217, 83, 79, 0.3)', 'hsl(200, 50%, 40%)', 'var(--panel2)', 'transparent', 'red'].forEach(function(c) { check('cssColor keeps ' + c, SC.cssColor(c) === c); });
    ['url(//evil.example/c)', 'red;background:url(//evil.example/c)', '" onmouseover="x', 'expression(alert(1))', 'rgb(1,2,3) url(x)', 'var(--x);color:red', 'image-set(url(x))', 'a'.repeat(41)].forEach(function(c) { check('cssColor refuses ' + c.slice(0, 40), SC.cssColor(c) === '' && SC.cssColor(c, '#888') === '#888'); });
    check('cssColor refuses a non-string', SC.cssColor(12) === '' && SC.cssColor({}) === '' && SC.cssColor(null, 'x') === 'x');
    check('num: a number or a numeric string', SC.num('5', 1) === 5 && SC.num(-2.5, 0) === -2.5 && SC.num('0', 7) === 0);
    check('num: anything else is the default', SC.num('1" onfocus="x', 3) === 3 && SC.num('abc', 3) === 3 && SC.num(Infinity, 3) === 3 && SC.num(NaN, 3) === 3 && SC.num(null, 3) === 3 && SC.num('', 3) === 3 && SC.num(true, 3) === 3 && SC.num([5], 3) === 3 && SC.num({}, 3) === 3);
    check('num: clamped when bounds are given', SC.num(900, 0, -200, 200) === 200 && SC.num(-900, 0, -200, 200) === -200 && SC.num(3, 0, 0.1, 2) === 2);
    ['/saves/images/m1/My Map (1).png', "/saves/images/m1/it's here.webp", 'assets/tutorial/inn.webp', 'data:image/png;base64,iVBORw0KGgo=', 'data:image/svg+xml,%3Csvg%3E', 'blob:http://127.0.0.1:3999/1f2e'].forEach(function(v) { check('picRef keeps ' + v.slice(0, 40), SC.picRef(v) === v); });
    const refused = [U, 'HTTPS://evil.example/x.png', 'http:evil.example', '//evil.example/x.png', '/\\evil.example/x.png', '\\\\evil.example\\x.png', ' //evil.example/x.png', '\t//evil.example', '/\t/evil.example/x.png', '/\n/evil.example/x.png', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'file:///C:/Windows/win.ini', 'data:text/html,<script>alert(1)</script>', 'ftp://evil.example/x', '\u0000/evil', 'x'.repeat(2100)];
    refused.forEach(function(v) { check('picRef refuses ' + JSON.stringify(v.slice(0, 40)), SC.picRef(v) === ''); });
    check('picRef refuses a non-string', SC.picRef(null) === '' && SC.picRef(5) === '' && SC.picRef({ src: '/saves/images/a.png' }) === '');
    // the property the rule is for: whatever picRef lets through never resolves to another origin
    const probes = refused.concat(['/saves/images/a.png', 'a.png', './a.png', '../a.png', '/./a.png', '/%2F%2Fevil.example/a.png', '/.//evil.example/a.png', '%2F%2Fevil.example', '?//evil.example', '#//evil.example', 'saves/images/a b.png', '/saves/images/\u00e9t\u00e9.png', '/ /evil.example']);
    const escaped = probes.filter(function(v) { var p = SC.picRef(v); return p && leavesApp(p); });
    check('nothing picRef lets through leaves the app (WHATWG URL)', escaped.length === 0, escaped);

    /* ---- the planner preview (planner.js plannerPreviewHtml) ---- */
    const plannerPreviewHtml = new Function('esc', 'sanitizeHtml', 'proseHtml', 'stripMermaidLinks', 'compileFlowchart', 'docStyleCss', 'mergeDocStyle', 'num', 'picRef', 'fmtHtml', 'fmtRich', 'fieldFmt', 'colFmtOf', 'cellFmtOf', 'mermaidPre',
        slice('planner.js', 'planner-preview') + '\nreturn plannerPreviewHtml;')(SC.esc, DR.sanitizeHtml, DR.proseHtml, DR.stripMermaidLinks, DR.compileFlowchart, DR.docStyleCss, DR.mergeDocStyle, SC.num, SC.picRef, DR.fmtHtml, DR.fmtRich, DR.fieldFmt, DR.colFmtOf, DR.cellFmtOf, DR.mermaidPre);
    const camp = { id: 'c1', docStyle: { textColor: 'red;background:url(//evil.example/d)', bgImage: U }, items: {
        m2: { id: 'm2', type: 'map', meta: { title: T }, rooms: [{ id: P, name: T }] }
    } };
    const hostile = { id: 'p1', type: 'planner', meta: { title: T, style: { bgColor: '#123;background:url(//evil.example/s)', bgImage: '//evil.example/bg.png' } }, blocks: [
        { type: 'h1', title: T, sub: '<script>alert(1)</script>' },
        { type: 'h2', title: '<svg onload=alert(1)>' },
        { type: 'lede', content: T },
        { type: 'oneline', content: '<iframe src="//evil.example"></iframe>' },
        { type: 'text', content: '<p onclick="alert(1)">x</p><a href="javascript:alert(1)">y</a><img src="' + U + '">' },
        { type: 'flare', content: '<div style="background:url(//evil.example/t)">z</div>' },
        { type: 'callout', content: '<p>' + T + '</p>' },
        { type: 'diagram', content: '</pre>' + T + '\nclick A call alert()\nA --> B' },
        { type: 'image', src: U, width: '100%;background:url(//evil.example/w)', caption: P },
        { type: 'image', src: '/saves/images/m1/ok.png', width: '50;background:url(//evil.example/w)', align: 'left', caption: T },
        { type: 'node', title: T, tag: '<svg/onload=alert(1)>', must: T, linkMapId: 'constructor', cols: [T, P], rows: [{ col1: T, col2: P }, null] },
        { type: 'node', title: 'Scene', linkMapId: 'm2', linkRoomId: P },
        { type: 'node', mode: 'table', title: T, rows: 'not rows' },
        { type: 'flowchart', boxW: '1px;background:url(//evil.example/f)', boxH: 200, nodes: [{ id: 'a', text: T }, null, { id: 'b', text: 'ok' }], edges: [{ from: 'a', to: 'b', text: T }, null] },
        { type: 'flowchart', nodes: { a: 1 }, edges: 'x' },
        { type: T }, null, 'a string'
    ] };
    let hHtml = '';
    check('planner preview: a hostile planner renders without a crash', throwsNot(function() { hHtml = plannerPreviewHtml(hostile, camp); }));
    check('planner preview: nothing in it can run or call out', risks(hHtml).length === 0, risks(hHtml));
    check('planner preview: the map link is escaped, not a prototype hit', hHtml.indexOf('data-map="m2"') >= 0 && hHtml.indexOf('data-map="constructor"') < 0);
    check('planner preview: a web picture shows no figure; the library one does, its malformed width the default', hHtml.indexOf('evil.example/beacon') < 0 && /<figure class="planner-img" style="width:100%; margin-left:0; margin-right:auto;"><img src="\/saves\/images\/m1\/ok\.png"/.test(hHtml) && hHtml.split('<figure').length === 2);
    check('planner preview: box sizes are numbers', /data-fc="\d+" style="height:200px;"/.test(hHtml) && hHtml.indexOf('1px;background') < 0);
    check('planner preview: a diagram loses its click directive', mermaidReads(hHtml, 0).indexOf('click') < 0 && mermaidReads(hHtml, 0).indexOf('A --> B') >= 0);
    check('planner preview: the style is the cleaned one (no colour from the file)', hHtml.indexOf('background-color:#123') < 0 && hHtml.indexOf('evil.example/bg') < 0);
    const benign = { id: 'p2', type: 'planner', meta: {}, blocks: [
        { type: 'h1', title: 'Tom &amp; Jerry &mdash; <em>Act I</em>', sub: 'a<br>b' },
        { type: 'text', content: '<p><b>bold</b> and <i>it</i></p><ul><li>one</li></ul>' },
        { type: 'lede', content: 'line one\nline two' },
        { type: 'node', title: 'N', tag: 'Tag', must: 'Win <b>now</b>', cols: ['A', 'B'], rows: [{ col1: 'x<br>y', col2: '5 < 6' }] },
        { type: 'diagram', content: 'graph TD\n  A[Start] --> B{Is it?}\n  B -->|Yes| C["Tom & Jerry"]\n  C --> D[line1<br>line2]\n  D <--> E' },
        { type: 'diagram', content: 'graph LR\n  X --&gt; Y' },
        { type: 'raw', content: '<div class="mine" style="color:red">raw stays raw</div>' },
        { type: 'image', src: '/saves/images/m1/My Map (1).png', width: 50, align: 'right', caption: 'cap' },
        { type: 'flowchart', dir: 'LR', nodes: [{ id: 'a', text: 'Two\nlines' }, { id: 'b', text: 'B & C' }], edges: [{ from: 'a', to: 'b', text: 'go' }] }
    ] };
    const bHtml = plannerPreviewHtml(benign, { id: 'c1', items: {} });
    check('planner preview: inline formatting and entities in a title read as before', bHtml.indexOf('<h1>Tom &amp; Jerry \u2014 <em>Act I</em><span class="sub">a<br>b</span></h1>') >= 0, bHtml.slice(0, 300));
    check('planner preview: prose keeps bold, italic, lists and typed line breaks', bHtml.indexOf('<p><b>bold</b> and <i>it</i></p><ul><li>one</li></ul>') >= 0 && bHtml.indexOf('<p class="lede">line one<br>line two</p>') >= 0);
    check('planner preview: node fields and cells keep a typed <br> and escape a bare <', bHtml.indexOf('<p class="must"><b>Must resolve:</b> Win <b>now</b></p>') >= 0 && bHtml.indexOf('<td>x<br>y</td><td>5 &lt; 6</td>') >= 0 && bHtml.indexOf('<span class="tag">Tag</span>') >= 0);
    check('planner preview: mermaid reads a typed diagram exactly as typed', mermaidReads(bHtml, 0) === benign.blocks[4].content, mermaidReads(bHtml, 0));
    check('planner preview: a Markdown import\'s escaped diagram reads as its text', mermaidReads(bHtml, 1) === 'graph LR\n  X --> Y', mermaidReads(bHtml, 1));
    check('planner preview: the flowchart compiles as a page\'s does', mermaidReads(bHtml, 2) === DR.compileFlowchart(benign.blocks[8]));
    check('planner preview: a Raw HTML block is the GM\'s own, as written', bHtml.indexOf('<div class="mine" style="color:red">raw stays raw</div>') >= 0);
    check('planner preview: a library picture keeps its name and width', bHtml.indexOf('<figure class="planner-img" style="width:50%; margin-left:auto; margin-right:0;"><img src="/saves/images/m1/My Map (1).png" alt="cap"><figcaption>cap</figcaption></figure>') >= 0);
    check('planner preview: an empty planner shows the hint', plannerPreviewHtml({ blocks: [] }, null).indexOf('This is the live preview pane.') >= 0 && plannerPreviewHtml({ blocks: 'x' }, null).indexOf('This is the live preview pane.') >= 0);

    /* ---- text style (1.5.0): a plain field's format in the planner preview — drawn from runs, hostile formats plain, none exactly as before ---- */
    {
        const RED = '#d9534f', GREEN = '#5cb87a';
        const stPlain = () => ({ id: 'p3', type: 'planner', meta: {}, blocks: [
            { type: 'h1', title: 'Tom &amp; Jerry', sub: 'a<br>b' },
            { type: 'h2', title: 'Beats' },
            { type: 'node', title: 'N', tag: 'Tag', must: 'Win <b>now</b>', cols: ['A', 'B'], rows: [{ col1: 'x<br>y', col2: '5 < 6' }] },
            { type: 'node', mode: 'table', title: 'Loot', rows: [{ col1: 'gold', col2: '9' }] },
            { type: 'image', src: '/saves/images/m1/ok.png', caption: 'cap & <b>' },
            { type: 'flowchart', nodes: [{ id: 'a', text: 'buy milk\nwalk dog' }, { id: 'b', text: 'B' }], edges: [{ from: 'a', to: 'b', text: 'go' }] }
        ] });
        const st = stPlain();
        st.blocks[0].fmt = { title: { color: RED }, sub: { i: true } };
        st.blocks[1].fmt = { title: { size: 'large' } };
        st.blocks[2].fmt = { title: { b: true }, tag: { color: GREEN }, must: { spans: [{ s: 0, e: 3, i: true }] } }; st.blocks[2].colFmt = [null, { b: true }]; st.blocks[2].rows[0].fmt = { col2: { spans: [{ s: 0, e: 1, color: RED }] } };
        st.blocks[3].colFmt = [{ i: true }]; st.blocks[3].rows[0].fmt = { col1: { color: GREEN } };
        st.blocks[4].fmt = { caption: { b: true } };
        st.blocks[5].nodes[0].fmt = { color: RED, spans: [{ s: 9, e: 17, color: GREEN, b: true }] }; st.blocks[5].edges[0].fmt = { i: true };
        const campS = { id: 'c1', items: {} }, sHtml = plannerPreviewHtml(st, campS), pHtml = plannerPreviewHtml(stPlain(), campS);
        check('text style (planner preview): a title and a subtitle, a section, a scene node\'s title, tag and must-resolve are drawn from their runs — the field through the page sanitiser, its runs in spans the renderer writes (a run\'s span ends at a typed tag and goes on after it)',
            sHtml.indexOf('<h1><span style="color:#d9534f;">Tom &amp; Jerry</span><span class="sub"><span style="font-style:italic;">a</span><br><span style="font-style:italic;">b</span></span></h1>') >= 0 && sHtml.indexOf('<h2><span style="font-size:1.2em;">Beats</span></h2>') >= 0
            && sHtml.indexOf('<h3><span style="font-weight:bold;">N</span> <span class="tag"><span style="color:#5cb87a;">Tag</span></span></h3>') >= 0 && sHtml.indexOf('<p class="must"><b>Must resolve:</b> <span style="font-style:italic;">Win</span> <b>now</b></p>') >= 0, sHtml.slice(0, 900));
        check('text style (planner preview): a table\'s heads (typed or the default ones) and cells, and a picture\'s caption (its alt text stays plain)',
            sHtml.indexOf('<th>A</th><th><span style="font-weight:bold;">B</span></th>') >= 0 && sHtml.indexOf('<td>x<br>y</td><td><span style="color:#d9534f;">5</span> &lt; 6</td>') >= 0
            && sHtml.indexOf('<th><span style="font-style:italic;">Item</span></th><th>Detail</th><th>Notes</th>') >= 0 && sHtml.indexOf('<td><span style="color:#5cb87a;">gold</span></td><td>9</td>') >= 0
            && sHtml.indexOf('alt="cap &amp; &lt;b&gt;"><figcaption><span style="font-weight:bold;">cap &amp; &lt;b&gt;</span></figcaption>') >= 0, sHtml);
        check('text style (planner preview): a flowchart node\'s label and an arrow\'s compile with their runs, as a page\'s do; nothing in the preview can run or call out',
            mermaidReads(sHtml, 0) === DR.compileFlowchart(st.blocks[5]) && mermaidReads(sHtml, 0).indexOf('a["<font color=d9534f>buy milk<br></font><font color=5cb87a><b>walk dog</b></font>"]') >= 0 && mermaidReads(sHtml, 0).indexOf('|"<i>go</i>"|') >= 0 && risks(sHtml).length === 0, mermaidReads(sHtml, 0));
        check('text style (planner preview): with no format the markup is exactly what it was (pinned), and never a span of the renderer\'s',
            pHtml.indexOf('<h1>Tom &amp; Jerry<span class="sub">a<br>b</span></h1>') >= 0 && pHtml.indexOf('<h2>Beats</h2>') >= 0 && pHtml.indexOf('<h3>N <span class="tag">Tag</span></h3>') >= 0 && pHtml.indexOf('<p class="must"><b>Must resolve:</b> Win <b>now</b></p>') >= 0
            && pHtml.indexOf('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>x<br>y</td><td>5 &lt; 6</td></tr></tbody></table>') >= 0 && pHtml.indexOf('<th>Item</th><th>Detail</th><th>Notes</th>') >= 0
            && pHtml.indexOf('<figcaption>cap &amp; &lt;b&gt;</figcaption>') >= 0 && pHtml.indexOf('<span style') < 0 && mermaidReads(pHtml, 0).indexOf('a["buy milk<br>walk dog"]:::neutral') >= 0);
        const hs = stPlain();
        hs.blocks[0].fmt = { title: { color: 'red;background:url(//evil.example/t)', size: '40px;position:fixed', b: 'yes', spans: [{ s: 0, e: 3, color: P }, { s: -4, e: 2, b: true }, { s: 1, e: 1, i: true }] }, sub: T, __proto__: { title: { b: true } } };
        hs.blocks[1].fmt = [{ title: { b: true } }];
        hs.blocks[2].fmt = { title: { style: 'color:red', onclick: 'alert(1)' }, tag: null, must: { spans: 'x' } }; hs.blocks[2].colFmt = { 1: { b: true } }; hs.blocks[2].rows[0].fmt = { col2: { color: 'url(' + U + ')' }, constructor: { b: true } };
        hs.blocks[3].colFmt = [U, T, P]; hs.blocks[3].rows[0].fmt = T;
        hs.blocks[4].fmt = { caption: { color: 'expression(alert(1))' } };
        hs.blocks[5].nodes[0].fmt = { color: '"]:::x\nclick a call alert()', size: '</big><img src=' + U + '>', spans: [{ s: 0, e: 4, color: 'd9534f onerror=alert(1)' }] }; hs.blocks[5].edges[0].fmt = { b: 1, i: 'true' };
        let hsHtml = '';
        check('text style (planner preview): hostile formats draw plain — the markup is exactly the unstyled planner\'s — and nothing in it can run or call out',
            throwsNot(function() { hsHtml = plannerPreviewHtml(hs, campS); }) && hsHtml === pHtml && risks(hsHtml).length === 0 && ({}).title === undefined, hsHtml.slice(0, 600));
        const mixed = stPlain(); mixed.blocks[0].title = T + ' and ' + T; mixed.blocks[0].fmt = { title: { color: RED, spans: [{ s: 5, e: 40, b: true }] } }; mixed.blocks[2].rows[0].col1 = '<a href="javascript:alert(1)">x</a><script>alert(1)</script>'; mixed.blocks[2].rows[0].fmt = { col1: { spans: [{ s: 3, e: 31, color: GREEN }] } };
        const mxHtml = plannerPreviewHtml(mixed, campS);
        check('text style (planner preview): a run boundary inside typed markup cannot make markup, and nothing of a dropped tag shows as text — the field is sanitised whole, exactly as with no format, and the runs are laid over the text that is left', risks(mxHtml).length === 0 && !/<(script|a)\b/i.test(mxHtml) && mxHtml.split('<img').length === 2 && mxHtml.indexOf('<h1><span style="color:#d9534f;font-weight:bold;"> and </span><span class="sub">a<br>b</span></h1>') > 0 && mxHtml.indexOf('<td><span style="color:#5cb87a;">x</span></td>') > 0 && mxHtml.indexOf('onerror') < 0 && mxHtml.indexOf('javascript') < 0, risks(mxHtml));   // the one <img is the picture block's own
        // a planner's plain fields have always read typed markup: a format changes the look of the text, never how the markup reads
        const typed = stPlain(); typed.blocks[2].rows[0].col1 = 'a <b>bold</b> &mdash; c'; typed.blocks[2].must = 'x &mdash; y'; typed.blocks[1].title = '<span style="font-size:1.728em">Beats</span>'; typed.blocks[0].title = '<span style="font-size:1.728em">T</span>';
        const typedPlain = plannerPreviewHtml(typed, campS);
        typed.blocks[2].rows[0].fmt = { col1: { spans: [{ s: 5, e: 9, color: GREEN }] } }; typed.blocks[2].fmt = { must: { spans: [{ s: 0, e: 5, color: RED }] } }; typed.blocks[1].fmt = { title: { size: 'huge' } }; typed.blocks[0].fmt = { title: { b: true } };
        const tyHtml = plannerPreviewHtml(typed, campS), h2of = h => (/<h2>.*?<\/h2>/.exec(h) || [''])[0];
        check('text style (planner preview): a run that begins inside typed markup leaves it reading as it did — a styled word inside a typed <b> is coloured and still bold, a dash typed as &mdash; is still a dash wherever a run ends',
            typedPlain.indexOf('<td>a <b>bold</b> \u2014 c</td>') > 0 && tyHtml.indexOf('<td>a <b><span style="color:#5cb87a;">bold</span></b> \u2014 c</td>') > 0 && tyHtml.indexOf('<p class="must"><b>Must resolve:</b> <span style="color:#d9534f;">x \u2014</span> y</p>') > 0 && tyHtml.indexOf('&amp;mda') < 0 && risks(tyHtml).length === 0, tyHtml.slice(0, 1200));
        check('text style (planner preview): a field with a size draws one size only — a size typed into it as a span is dropped (they would multiply); without a size on the field the typed one stands',
            h2of(typedPlain) === '<h2><span style="font-size:1.728em">Beats</span></h2>' && h2of(tyHtml) === '<h2><span style="font-size:1.728em;">Beats</span></h2>' && h2of(tyHtml).split('font-size').length === 2
            && tyHtml.indexOf('<h1><span style="font-size:1.728em"><span style="font-weight:bold;">T</span></span><span class="sub">a<br>b</span></h1>') > 0, h2of(tyHtml));
        check('text style (planner preview, wired): every field that reads typed markup — a title, a subtitle, a section, a node\'s title, tag and must-resolve, a head, a cell — is drawn by fmtRich; only the caption (escaped text) by fmtHtml',
            (() => { const s = slice('planner.js', 'planner-preview'); return (s.match(/fmtRich\(/g) || []).length === 8 && (s.match(/fmtHtml\(/g) || []).length === 1 && /fmtHtml\(b\.caption, fieldFmt\(b, 'caption'\), esc\)/.test(s) && !/fmtHtml\([^\n;]*sanitizeHtml\)/.test(s); })());

        // the reader, a floating panel and a pop-out: a page as a player's app draws it (cleaned again there, then the one renderer)
        const page = { id: 'd1', type: 'doc', meta: { title: 'P', players: true }, blocks: [
            { id: 'b1', type: 'h1', title: 'Rules ' + T, sub: 'v1', fmt: { title: { color: RED, spans: [{ s: 0, e: 5, b: true }] }, sub: { color: 'red" onmouseover="alert(1)' } } },
            { id: 'b2', type: 'table', title: 'T', cols: ['A', P], colFmt: [null, { i: true }], rows: [{ col1: T, col2: 'y', fmt: { col1: { color: GREEN }, col2: { color: 'url(' + U + ')' } } }] },
            { id: 'b3', type: 'flowchart', nodes: [{ id: 'a', text: T, fmt: { color: GREEN, size: 'huge' } }], edges: [] }
        ] };
        const asPlayer = DR.cleanDoc(DR.cleanDoc(page), { keepHidden: true }), rHtml = DR.renderDoc(asPlayer, { src: function(p) { return 'blob:http://127.0.0.1:3999/1'; } });
        const hbSrc = read('handbook.js'), dpSrc = fs.readFileSync(path.join(dir, 'docpanel.js'), 'latin1'), poSrc = fs.readFileSync(path.join(dir, 'popout.js'), 'latin1');
        check('text style (reader): a styled page a player\'s app holds draws its runs as escaped text in spans the renderer writes; a hostile format beside them draws plain; nothing can run or call out',
            rHtml.indexOf('<h1><span style="color:#d9534f;font-weight:bold;">Rules</span><span style="color:#d9534f;"> &lt;img src=x onerror=alert(1)&gt;</span><span class="sub">v1</span></h1>') >= 0
            && rHtml.indexOf('<th><span style="font-style:italic;">x&quot; onmouseover=&quot;alert(1)&quot; y=&quot;</span></th>') >= 0 && rHtml.indexOf('<td><span style="color:#5cb87a;">&lt;img src=x onerror=alert(1)&gt;</span></td><td>y</td>') >= 0 && risks(rHtml).length === 0, rHtml.slice(0, 900));
        check('text style (reader, wired): the reader, the floating panel and the pop-out window all draw a page through docrender\'s renderDoc, and a player\'s app stores a page only as cleanDoc rebuilt it',
            /body\.innerHTML = renderDoc\(it, \{ src: srcOf, mermaid: !!window\.mermaid, docStyle: _camp && _camp\.docStyle \}\);/.test(hbSrc) && /body\.innerHTML = DR\.renderDoc\(it, /.test(dpSrc) && /body\.innerHTML = DR\.renderDoc\(it, /.test(poSrc)
            && (read('net.js').match(/window\.wpDocRender\.cleanDoc\((incoming|itS|it), \{ keepHidden: true \}\)/g) || []).length === 3 && /if \(item\.type === 'doc'\) return window\.wpDocRender \? window\.wpDocRender\.cleanDoc\(item\) : null;/.test(read('net.js')));

        // a size on a part, underline, strike and a link (the owner, 2026-10-02): the preview and the reader with hostile ones
        const OKL = 'https://ok.example/p?a=1&b=2', OKA = '<a href="https://ok.example/p?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">';
        const BADL = ['javascript:alert(1)', 'JAVASCRIPT:alert(1)//', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'https://a.example/' + String.fromCharCode(0) + 'x', 'https://a.example/ x', 'https://a.example/' + String.fromCharCode(10) + 'x', '//evil.example/x', P, 'https://' + 'a'.repeat(2000), 7, { href: U }, [U]];
        const lk = v => { const s = stPlain();
            s.blocks[0].fmt = { title: { link: v, u: true }, sub: { spans: [{ s: 0, e: 1, link: v, size: '99em;position:fixed' }] } };
            s.blocks[1].fmt = { title: { spans: [{ s: 0, e: 2, link: v, size: 'huge' }, { s: 2, e: 5, link: OKL, st: true }] } };
            s.blocks[2].fmt = { title: { link: v }, tag: { link: v }, must: { link: v } }; s.blocks[2].colFmt = [{ link: v }]; s.blocks[2].rows[0].fmt = { col1: { link: v }, col2: { spans: [{ s: 0, e: 1, link: v, size: P }] } };
            s.blocks[4].fmt = { caption: { link: v, size: 'small' } };
            s.blocks[5].nodes[0].fmt = { link: v, spans: [{ s: 0, e: 3, link: OKL, size: 'large', u: true }] }; s.blocks[5].edges[0].fmt = { link: v, st: true };
            return s; };
        const okPv = plannerPreviewHtml(lk(OKL), campS);
        check('text style (planner preview): a link is the sanitiser\'s own <a href> — the address escaped, the fixed target and rel — around the field\'s runs, in a title, a tag, must-resolve, a head, a cell and a caption; a part\'s size and a strike are fixed words in the run\'s style',
            okPv.indexOf('<h1>' + OKA + '<span style="text-decoration:underline;">Tom &amp; Jerry</span></a><span class="sub">' + OKA + 'a</a><br>b</span></h1>') >= 0
            && okPv.indexOf('<h2>' + OKA + '<span style="font-size:1.728em;">Be</span><span style="text-decoration:line-through;">ats</span></a></h2>') >= 0 && okPv.indexOf('<h3>' + OKA + 'N</a> <span class="tag">' + OKA + 'Tag</a></span></h3>') >= 0
            && okPv.indexOf('<p class="must"><b>Must resolve:</b> ' + OKA + 'Win </a><b>' + OKA + 'now</a></b></p>') >= 0 && okPv.indexOf('<th>' + OKA + 'A</a></th><th>B</th>') >= 0 && okPv.indexOf('<td>' + OKA + 'x</a><br>' + OKA + 'y</a></td><td>' + OKA + '5</a> &lt; 6</td>') >= 0
            && okPv.indexOf('<figcaption><span style="font-size:0.833em;">' + OKA + 'cap &amp; &lt;b&gt;</a></span></figcaption>') >= 0 && risks(okPv).length === 0 && !/href|https?:|<a\b/i.test(mermaidReads(okPv, 0)), okPv.slice(0, 1500));
        check('text style (planner preview): a hostile link — javascript:, data:, a control character or white space inside, a protocol-relative one, an attribute breakout, an over-long one, one that is no string — draws no <a> in any field (the text and the rest of its look are drawn), a hostile size draws no size, the one allowed link beside them is the sanitiser\'s own <a>, a flowchart label carries no link at all, and nothing can run or call out',
            BADL.every(v => { const h = plannerPreviewHtml(lk(v), campS), as = h.match(/<a\b[^>]*>/g) || [], mmS = mermaidReads(h, 0);
                return as.length === 1 && as[0] === OKA && h.indexOf('<h2><span style="font-size:1.728em;">Be</span>' + OKA + '<span style="text-decoration:line-through;">ats</span></a></h2>') > 0
                    && h.indexOf('<h1><span style="text-decoration:underline;">Tom &amp; Jerry</span><span class="sub">a<br>b</span></h1>') > 0 && h.indexOf('<h3>N <span class="tag">Tag</span></h3>') > 0 && h.indexOf('<td>x<br>y</td><td>5 &lt; 6</td>') > 0
                    && h.indexOf('<figcaption><span style="font-size:0.833em;">cap &amp; &lt;b&gt;</span></figcaption>') > 0 && risks(h).length === 0 && !/javascript:|vbscript:|data:text|position:fixed|99em|onmouseover|evil\.example/i.test(h)
                    && !/href|https?:|<a\b/i.test(mmS) && mmS.indexOf('a["<big><u>buy</u></big> milk<br>walk dog"]') >= 0 && mmS.indexOf('|"<s>go</s>"|') >= 0; }),
            JSON.stringify(BADL.filter(v => (plannerPreviewHtml(lk(v), campS).match(/<a\b[^>]*>/g) || []).length !== 1)));
        const TRICK = 'https://ok.example/?q="><img/src=x/onerror=alert(1)>';   // an allowed address that tries to leave its attribute
        const pageL = v => ({ id: 'd2', type: 'doc', meta: { title: 'P', players: true }, blocks: [
            { id: 'b1', type: 'h1', title: 'Rules ' + T, sub: 'v1', fmt: { title: { link: v, spans: [{ s: 0, e: 5, size: 'large', u: true }] }, sub: { link: TRICK } } },
            { id: 'b2', type: 'table', title: 'T', cols: ['A'], colFmt: [{ link: v, st: true }], rows: [{ col1: T, fmt: { col1: { spans: [{ s: 0, e: 4, link: v, size: 'huge' }, { s: 5, e: 8, size: 'url(' + U + ')' }] } } }] },
            { id: 'b3', type: 'image', src: '/saves/images/m1/ok.png', caption: 'cap', fmt: { caption: { link: v, size: '1.2em' } } },
            { id: 'b4', type: 'flowchart', nodes: [{ id: 'a', text: 'label', fmt: { link: OKL, u: true } }], edges: [] } ] });
        check('text style (reader): a page a hostile host sends with links and sizes that are not allowed, as a player\'s app holds and draws it — no <a> but the one allowed, whose address cannot leave its attribute; the run\'s text escaped; a size only as a fixed step; the chart\'s label with no link; nothing can run or call out',
            BADL.every(v => { const pl = DR.cleanDoc(DR.cleanDoc(pageL(v)), { keepHidden: true }), h = DR.renderDoc(pl, { src: function(p) { return 'blob:http://127.0.0.1:3999/1'; } }), as = h.match(/<a\b[^>]*>/g) || [];
                return as.length === 1 && as[0] === '<a href="https://ok.example/?q=&quot;&gt;&lt;img/src=x/onerror=alert(1)&gt;" target="_blank" rel="noopener noreferrer">'
                    && h.indexOf('<h1><span style="text-decoration:underline;font-size:1.2em;">Rules</span> &lt;img src=x onerror=alert(1)&gt;<span class="sub">' + as[0] + 'v1</a></span></h1>') >= 0 && h.indexOf('<th><span style="text-decoration:line-through;">A</span></th>') >= 0
                    && h.indexOf('<td><span style="font-size:1.728em;">&lt;img</span> src=x onerror=alert(1)&gt;</td>') >= 0 && h.indexOf('<figcaption>cap</figcaption>') >= 0 && risks(h).length === 0 && !/javascript:|vbscript:|data:text|evil\.example/i.test(h)
                    && !/href|https?:/i.test(mermaidReads(h, 0)) && mermaidReads(h, 0).indexOf('a["<u>label</u>"]') >= 0 && JSON.stringify(pl).indexOf('"link":"https://ok.example/p') < 0; }),
            JSON.stringify(BADL.filter(v => (DR.renderDoc(DR.cleanDoc(DR.cleanDoc(pageL(v)), { keepHidden: true }), {}).match(/<a\b[^>]*>/g) || []).length !== 1)));
    }

    /* ---- text style (1.5.0): a text block's own bar — its colour and size controls are markup too ---- */
    {
        const TFm = await import(modUrl('textfmt.js'));
        const mkBar = (TFx, what) => new Function('TF', 'esc', 'sanitizeHtml', 'nl', slice('planner.js', 'rtebar') + '\nreturn ' + (what || 'rteHtml') + ';')(TFx, SC.esc, DR.sanitizeHtml, DR.nl);
        const barHtml = mkBar(TFm)(3, { type: 'text', content: '<p><span style="color: rgb(217, 83, 79)">red</span><font color="#5cb87a">g</font><span style="font-size:99px;background:url(' + U + ')">x</span></p>' });
        const sw = barHtml.match(/<button type="button" class="rte-sw" data-color="(#[0-9a-f]{6})" title="[^"<>]*" style="background:\1;" tabindex="-1"><\/button>/g) || [];
        check('text style (text block): its own bar gains the seven inks, a custom colour, Default and the size steps — from the core\'s constants, with no handler attribute',
            sw.length === 7 && TFm.PALETTE.every(function(p, k) { return sw[k].indexOf('data-color="' + p[0] + '"') > 0; }) && barHtml.indexOf('<input type="color" class="rte-colorpick"') > 0 && barHtml.indexOf('class="rte-btn rte-nocolor"') > 0
            && /<select class="rte-size"[^>]*><option value="">Size\u2026<\/option><option value="default">Default<\/option><option value="small">Small<\/option><option value="large">Large<\/option><option value="larger">Larger<\/option><option value="huge">Huge<\/option><\/select>/.test(barHtml) && risks(barHtml).length === 0, barHtml.slice(0, 600));
        check('text style (text block): the box holds the stored colour and size in the sanitiser\'s one form (what the editing commands left is read into it; anything else is gone)',
            barHtml.indexOf('<p><span style="color:#d9534f">red</span><span style="color:#5cb87a">g</span>x</p>') > 0 && barHtml.indexOf('evil.example') < 0);
        check('text block Link (the bar\'s markup): the Link box is an input the planner\'s own bar writes — its title the control\'s own words, escaped; no handler attribute; never a command of the shared list',
            /<label class="ts-linklab rte-linklab" title="[^"<>]*a text block styles a selection, not the whole block\.">Link <input type="text" class="ts-link rte-link" placeholder="https:\/\/\u2026" spellcheck="false" autocomplete="off" aria-label="Link address" tabindex="-1"><\/label>/.test(barHtml)
            && risks(barHtml).length === 0 && (barHtml.match(/<input /g) || []).length === 2 && !/createLink|data-cmd="link/i.test(barHtml), barHtml.slice(barHtml.indexOf('rte-linklab') - 20, barHtml.indexOf('rte-linklab') + 400));
        const cmds = mkBar(TFm, 'RTE_CMDS');
        check('text style (text block): the command list the play map\'s text box shares is as it was — every entry a command, a separator or the symbol tray (the colour and size controls are the planner bar\'s own, not in the list)',
            Array.isArray(cmds) && cmds.length === 11 && cmds.every(function(k) { return k.sep === true || k.sym === true || (typeof k.c === 'string' && typeof k.l === 'string' && typeof k.t === 'string'); }) && cmds.filter(function(k) { return k.c; }).map(function(k) { return k.c; }).join() === 'bold,italic,underline,strikeThrough,insertUnorderedList,insertOrderedList,removeFormat'
            && /var _rteBar = RTE_CMDS\.map\(function\(k\) \{\n\s*if \(k\.sep\) return '<span class="rte-sep"><\/span>';\n\s*if \(k\.sym\) return /.test(read('inspector.js')) && barHtml.indexOf('data-cmd="undefined"') < 0 && (barHtml.match(/class="rte-btn" data-cmd="/g) || []).length === 7, cmds);
        const evilBar = mkBar({ PALETTE: [[P, T]], SIZES: [P], SIZE_NAMES: {} })(0, { type: 'text', content: '' });
        check('text style (text block): the bar\'s markup escapes whatever its constants hold', risks(evilBar).length === 0 && evilBar.indexOf('<img') < 0 && evilBar.indexOf('data-color="x&quot; onmouseover=&quot;alert(1)&quot; y=&quot;"') > 0);
        const plannerAll = read('planner.js');
        check('text style (text block): a colour or a size is applied by the browser\'s own commands and then written as a span through the element\'s style (never as markup); the stored box is still the page sanitiser\'s on every draw',
            /rteExec\('foreColor', c \|\| MARK\);/.test(plannerAll) && /rteExec\('fontSize', '7'\);/.test(plannerAll) && /var sp = document\.createElement\('span'\); if \(color\) sp\.style\.color = color; if \(em\) sp\.style\.fontSize = em;/.test(plannerAll)
            && /var em = key && Object\.prototype\.hasOwnProperty\.call\(TF\.SIZE_EM, key\) \? TF\.SIZE_EM\[key\] : '';/.test(plannerAll) && !/insertHTML/.test(plannerAll));
        check('text style (text block): the selection is put back on the same characters after a colour or a size (so the next press needs no second selecting), and Ctrl+Z after one goes to the planner\'s own history',
            (plannerAll.match(/\n      rteSelect\(body, off\);\n  \}/g) || []).length === 2 && /var off = rteOffsets\(body\);\n      if \(!off \|\| off\[0\] === off\[1\]\) return;/.test(plannerAll)
            && /if \(change !== 'clear' && !\(change && \(change\.b === true \|\| change\.i === true \|\| change\.u === true \|\| change\.st === true\)\)\) body\._wpNativeDirty = false;/.test(plannerAll) && /if \(this\._wpQuiet\) return;/.test(plannerAll));
    }

    /* ---- the planner editor's plain boxes (planner.js: the fields, the box and the bar on it, run for real on tools/boxdom.js): a campaign
            from a file reaches a box as text nodes and fixed styles only ---- */
    {
        const TFb = await import(modUrl('textfmt.js')), { makeDom } = require('./boxdom.js');
        const boxesSrc = slice('planner.js', 'boxes'), dom = makeDom(), doc = dom.document, saved = [];
        const editor = dom.mk('div', '', {}, 'plannerEditorWrap'), blocksEl = dom.mk('div', '', {}, 'plannerBlocks'); doc.body.appendChild(editor); editor.appendChild(blocksEl);
        const LNK = 'https://a.example/"onclick="alert(1)';   // a web address the link rule keeps: it is only ever a title's text
        const dead = JSON.parse('{"b":1,"u":"true","size":"99em","color":"red;background:url(//evil.example/x)","link":"javascript:alert(1)","style":"color:red","onclick":"alert(1)","__proto__":{"i":true,"color":"#5cb87a"},"spans":[{"s":0,"e":4,"color":"expression(alert(1))","size":"huge;position:fixed","link":"data:text/html,x","b":"yes"},{"s":"0","e":9,"b":true},"x",null]}');
        const live = () => ({ color: '#D9534F', b: true, onclick: 'alert(1)', style: 'position:fixed', spans: [{ s: 0, e: 4, size: 'huge', u: true, st: true, link: LNK, style: 'x', href: 'javascript:alert(1)' }, { s: 4, e: 9, color: 'red;background:url(' + U + ')', size: '99em;position:fixed', link: 'javascript:alert(1)', i: true }] });
        const map = { id: 'p9', type: 'planner', meta: {}, blocks: [
            { id: 'a', type: 'h1', title: T + '<script>alert(1)</script>&lt;b&gt;', sub: P, fmt: { title: live(), sub: dead } },
            { id: 'b', type: 'node', title: T, tag: T, must: P, cols: [T, P], colFmt: [live(), dead], rows: [{ col1: T + P, col2: '<a href="javascript:alert(1)">x</a><style>*{display:none}</style>', fmt: { col1: live(), col2: dead } }] },
            { id: 'c', type: 'flowchart', nodes: [{ id: T, text: T + '\n' + P + '\n', fmt: live() }], edges: [{ from: 'a', to: 'b', text: T, fmt: dead }] },
            { id: 'd', type: 'image', src: U, caption: T + P, fmt: { caption: live() } }
        ] };
        const deps = { TF: TFb, diagramLink: DR.diagramLink, document: doc, window: dom.window, setTimeout: dom.setTimeout, esc: SC.esc, getActiveMap: () => map, isDocLike: () => true, save: () => { saved.push(JSON.stringify(map.blocks)); }, renderPlannerPreview: () => {}, stepBoundary: () => {}, stepFold: () => {}, stepSel: () => {}, toast: () => {}, fieldUndoChord: () => false, boxUndo: () => {} };
        const names = Object.keys(deps), api = new Function(...names, boxesSrc + '\nreturn { tsBoxHtml, tsFill, tsBuild, tsWire, tsBox, tsField };')(...names.map(k => deps[k]));
        const box = (cls, data, multi) => { const el = dom.mk('div', cls + ' ts-box' + (multi ? ' ts-multi' : ''), data); el.setAttribute('contenteditable', 'plaintext-only'); blocksEl.appendChild(el); return el; };
        const fields = [['field b-title', { idx: 0 }, { idx: 0, k: 'title' }], ['field b-sub', { idx: 0 }, { idx: 0, k: 'sub' }], ['field b-title', { idx: 1 }, { idx: 1, k: 'title' }], ['field b-sub', { idx: 1 }, { idx: 1, k: 'sub' }], ['field b-must', { idx: 1 }, { idx: 1, k: 'must' }],
            ['b-colhead', { idx: 1, ci: 0 }, { idx: 1, k: 'col', ci: 0 }], ['b-colhead', { idx: 1, ci: 1 }, { idx: 1, k: 'col', ci: 1 }], ['r-col', { idx: 1, ri: 0, ci: 0 }, { idx: 1, k: 'cell', ri: 0, ci: 0 }], ['r-col', { idx: 1, ri: 0, ci: 1 }, { idx: 1, k: 'cell', ri: 0, ci: 1 }],
            ['field fc-n-text fc-grow', { idx: 2, ni: 0 }, { idx: 2, k: 'node', ni: 0 }], ['fc-e-text', { idx: 2, ei: 0 }, { idx: 2, k: 'edge', ei: 0 }], ['field b-caption', { idx: 3 }, { idx: 3, k: 'caption' }]];
        const els = fields.map(f => box(f[0], f[1], f[2].k === 'node')), before = JSON.stringify(map.blocks);
        const drew = throwsNot(() => api.tsFill(blocksEl, map.blocks));   // the test page throws on any innerHTML, outerHTML or insertAdjacentHTML
        const SIZES = Object.keys(TFb.SIZE_EM).map(k => TFb.SIZE_EM[k]), DECOS = ['underline', 'line-through', 'underline line-through'];
        const styleOk = s => Object.keys(s).every(k => (k === 'color' && /^#[0-9a-f]{6}$/.test(s[k])) || (k === 'fontWeight' && s[k] === 'bold') || (k === 'fontStyle' && s[k] === 'italic') || (k === 'textDecoration' && DECOS.indexOf(s[k]) >= 0) || (k === 'fontSize' && SIZES.indexOf(s[k]) >= 0));
        let bad = null, runs = 0, styled = 0, linked = 0;
        els.forEach((el, k) => {
            const want = api.tsField(map.blocks, fields[k][2]).text(), multi = fields[k][2].k === 'node';
            let text = '';
            el.childNodes.forEach((c, i) => {
                if (multi && i === el.childNodes.length - 1 && c.nodeType === 1 && c.nodeName === 'BR' && !c.childNodes.length && !Object.keys(c.attrs).length) return;   // the one line-break element after a label's final line break
                if (c.nodeType !== 1 || c.nodeName !== 'SPAN' || c.childNodes.length !== 1 || c.firstChild.nodeType !== 3 || !/^tsr( tsr-link)?$/.test(c.className) || Object.keys(c.attrs).length || Object.keys(c.dataset).length || c.id || !styleOk(c.style) || (c.title && c.title !== 'Link: ' + LNK) || Object.keys(c.handlers).length || Object.keys(c.capture).length) { bad = bad || { field: k, child: i, node: c.nodeName, cls: c.className, style: c.style, title: c.title }; return; }
                runs++; if (Object.keys(c.style).length) styled++; if (c.title) linked++;
                text += c.firstChild.nodeValue;
            });
            if (text !== want) bad = bad || { field: k, text, want };
        });
        check('planner editor boxes: a campaign from a file — hostile titles, a tag, heads, cells, a label, a caption, each with a format — reaches the boxes as text nodes inside elements the app makes and nothing else: every character of the text is in a text node as it is (markup is its characters), a run\'s element carries only its class, a style made of a strict colour and fixed words, and at most a title; no attribute, no handler, no element from the text; drawing writes nothing to the campaign',
            drew && !bad && runs >= 20 && styled >= 8 && linked >= 4 && JSON.stringify(map.blocks) === before && saved.length === 0 && blocksEl.all().every(n => n.nodeName === 'DIV' || n.nodeName === 'SPAN' || n.nodeName === 'BR') && ({}).i === undefined, bad || { drew, runs, styled, linked });
        const sub = els[1], head1 = els[6], cell1 = els[8], edge = els[10];
        check('planner editor boxes: a format that holds nothing the cleaner keeps (a colour that is no colour, a size that is none, a script address, a style, a handler, inherited keys) draws the unstyled text — one element with no style and no title',
            [sub, head1, cell1, edge].every(el => el.childNodes.length === 1 && Object.keys(el.firstChild.style).length === 0 && el.firstChild.className === 'tsr' && !el.firstChild.title) && cell1.firstChild.firstChild.nodeValue === '<a href="javascript:alert(1)">x</a><style>*{display:none}</style>');
        check('planner editor boxes: a linked part is a span that looks like a link — its address, quotes and all, is the text of its title and of nothing else (no anchor, no href, nothing to follow)',
            els[0].firstChild.title === 'Link: ' + LNK && els[0].firstChild.className === 'tsr tsr-link' && els[0].firstChild.nodeName === 'SPAN' && els[0].firstChild.attrs.href === undefined && blocksEl.all().every(n => n.nodeName !== 'A' && !('href' in n) && n.attrs.href === undefined && n.attrs.onclick === undefined));
        // the markup renderPlanner writes for a box holds a placeholder from the file (a column's name) and never a field's text
        const html = api.tsBoxHtml('r-col', P + T, 'data-idx="1" data-ri="0" data-ci="0"', ''), htmlL = api.tsBoxHtml('field fc-n-text fc-grow', T, 'data-idx="2" data-ni="0"', 'flex: 1;', true);
        check('planner editor boxes: the markup of a box holds no field\'s text — only a placeholder, escaped whatever the file calls a column — and runs nothing',
            risks(html).length === 0 && risks(htmlL).length === 0 && html.indexOf('<img') < 0 && htmlL.indexOf('<img') < 0 && html.indexOf('data-placeholder="x&quot; onmouseover=&quot;alert(1)&quot; y=&quot;&lt;img src=x onerror=alert(1)&gt;"') > 0 && /^<div class="r-col ts-box" contenteditable="plaintext-only" role="textbox"/.test(html) && /><\/div>$/.test(html), [html, risks(html)]);
        // a paste and a drop of markup stay text
        api.tsBuild(editor, [['→', 'right arrow']]); api.tsWire(blocksEl, editor);
        const title = els[2]; title.focus(); dom.engine.caret(title, 0);
        const flav = { 'text/plain': '<b onclick="alert(1)">B</b>\n<script>alert(2)</script>', 'text/html': '<b onclick="alert(1)">B</b><img src=x onerror=alert(3)><script>alert(2)</script>' };
        const pasted = dom.engine.paste(title, flav), dropped = dom.fire(title, 'drop', { dataTransfer: { getData: t => (t === 'text/plain' ? '<iframe src=//evil.example>' : '<iframe src=//evil.example></iframe>') } });
        const lab = els[9]; lab.focus(); dom.engine.caret(lab, 0); dom.engine.paste(lab, flav);
        const onlyText = el => el.childNodes.every((c, i) => (c.nodeName === 'SPAN' && c.childNodes.length === 1 && c.firstChild.nodeType === 3 && !Object.keys(c.attrs).length) || (c.nodeName === 'BR' && i === el.childNodes.length - 1));
        check('planner editor boxes: a paste of markup stays text — only the clipboard\'s plain text comes in, as its characters, in the box and in the campaign (a one-line field takes the line break as a space, a label keeps it); nothing of the HTML flavour is read; a drop likewise; the engine\'s own insertion is cancelled',
            pasted.defaultPrevented && dropped.defaultPrevented && map.blocks[1].title === '<b onclick="alert(1)">B</b> <script>alert(2)</script>' + T + '<iframe src=//evil.example>' && onlyText(title) && dom.engine.textsOf(title).map(t => t.nodeValue).join('') === map.blocks[1].title
            && map.blocks[2].nodes[0].text === '<b onclick="alert(1)">B</b>\n<script>alert(2)</script>' + T + '\n' + P + '\n' && onlyText(lab) && saved.length === 3 && saved.every(s => s.indexOf('alert(3)') < 0), [map.blocks[1].title, map.blocks[2].nodes[0].text, saved.length]);
        // a scan of the boxes' whole code path: no markup is ever written from a string, every element is made by name
        const made = (boxesSrc.match(/document\.createElement\(([^)]*)\)/g) || []).map(s => s.replace(/^document\.createElement\(/, '').replace(/\)$/, '')), mks = (boxesSrc.match(/\bmk\('([a-z]+)'/g) || []).map(s => s.slice(4, -1)), btns = (boxesSrc.match(/\bbtn\('[a-z]+', '([a-z]+)'/g) || []).map(s => s.replace(/^.*, '/, '').replace(/'$/, ''));
        check('planner editor boxes (a scan of the fields, the box and the bar): no innerHTML, outerHTML, insertAdjacentHTML or document.write anywhere in that code; no handler attribute, no eval, no Function; every element is made by createElement with a fixed name (a run\'s span, the line-break element, the bar\'s own controls) and every text by createTextNode or textContent',
            !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|Function\(|setAttribute\('on|\.on[a-z]+ = /.test(boxesSrc) && made.slice().sort().join() === ["'br'", "'div'", "'span'", 'tag'].join() && mks.length >= 15 && mks.every(t => ['div', 'button', 'span', 'label', 'input', 'select', 'option'].indexOf(t) >= 0) && btns.join() === 'b,i,u,s'
            && /el\.appendChild\(document\.createTextNode\(String\(r\.t\)\)\);/.test(boxesSrc) && /if \(typeof r\.color === 'string' && \/\^#\[0-9a-f\]\{6\}\$\/\.test\(r\.color\)\) el\.style\.color = r\.color;/.test(boxesSrc) && /if \(link\) el\.title = 'Link: ' \+ TF\.cleanLink\(r\.link\);/.test(boxesSrc), [made, mks, btns]);
    }

    /* ---- the planner editor's rich-text boxes (planner.js rteInitial): a contenteditable is markup too ---- */
    const rteInitial = new Function('nl', 'sanitizeHtml', slice('planner.js', 'rte') + '\nreturn rteInitial;')(DR.nl, DR.sanitizeHtml);
    const rteHostile = [{ type: 'lede', content: 'Lede ' + T }, { type: 'text', content: '<p onclick="x">t</p><img src="' + U + '">' }, { type: 'flare', content: '<div style="background:url(//evil.example/f)">f</div>' }, { type: 'callout', content: '<iframe src="//evil.example"></iframe>' }].map(rteInitial).join('');
    check('planner editor: a box built from a hostile block runs and loads nothing', risks(rteHostile).length === 0 && rteHostile.indexOf('evil.example') < 0, risks(rteHostile));
    check('planner editor: the formatting the bar makes stays as typed', rteInitial({ type: 'text', content: '<p><b>B</b> <i>I</i> <u>U</u> <s>S</s></p><ul><li>one</li></ul><ol><li>two</li></ol>' }) === '<p><b>B</b> <i>I</i> <u>U</u> <s>S</s></p><ul><li>one</li></ul><ol><li>two</li></ol>');
    check('planner editor: typed line breaks still become paragraphs and breaks', rteInitial({ type: 'text', content: 'a\n\nb\nc' }) === '<p>a</p><p>b<br>c</p>' && rteInitial({ type: 'lede', content: 'x\ny' }) === 'x<br>y' && rteInitial({ type: 'callout', content: '' }) === '');

    /* ---- mermaid: a diagram's labels are HTML mermaid cleans itself — the app's config (scripts/bootdiagram.js, the page's last script) forbids pictures, styles and links ---- */
    const idx = fs.readFileSync(path.join(dir, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
    const readOr = f => { try { return read(f); } catch (e) { return ''; } };   // a file that is not there fails its check, it does not stop the suite
    const bootDiagram = readOr('bootdiagram.js');
    const mm = /window\.wpMermaidConfig = (\{[\s\S]*?\});\n/.exec(bootDiagram);
    const mcfg = mm ? new Function('return (' + mm[1] + ');')() : {};
    const dp = mcfg.dompurifyConfig || {}, ft = dp.FORBID_TAGS || [], fa = dp.FORBID_ATTR || [];
    check('mermaid config: labels keep no picture, frame, svg or style element', ['img', 'image', 'picture', 'source', 'video', 'audio', 'iframe', 'object', 'embed', 'svg', 'style', 'link'].every(t => ft.indexOf(t) >= 0), ft);
    check('mermaid config: labels keep no style, src, srcset or href attribute', ['style', 'src', 'srcset', 'href', 'xlink:href', 'background', 'poster'].every(a => fa.indexOf(a) >= 0), fa);
    // the library draws a $$…$$ formula in a label as a math element and, from 10.9.4, sends it through these same label rules: a rule against math would leave the label blank
    check('mermaid config: a formula in a label is drawn — the label rules let the math element through (the library draws $$…$$ as one and cleans it by these rules), never its picture element (mglyph), and every picture, frame, svg, style and link element and every style, src, srcset and href attribute stays forbidden',
        ft.indexOf('math') < 0 && ['mglyph', 'svg', 'style', 'img', 'image', 'picture', 'iframe', 'object', 'embed', 'link'].every(t => ft.indexOf(t) >= 0) && ['style', 'src', 'srcset', 'href', 'xlink:href'].every(a => fa.indexOf(a) >= 0), ft);
    check('mermaid config: a diagram\'s own %%{init}%% cannot change the label rules or the security level', ['dompurifyConfig', 'securityLevel', 'secure'].every(k => (mcfg.secure || []).indexOf(k) >= 0), mcfg.secure);
    check('mermaid config: the diagram library runs in its strict mode for EVERYONE — the GM\'s own screen too (an action of a diagram that calls a function never runs; a link\'s address goes through the library\'s own cleaner) — and a diagram cannot change that; handbook.js, the floating panel and a pop-out re-initialise from this same config and never loosen it',
        mcfg.securityLevel === 'strict' && mcfg.startOnLoad === false && !!mcfg.flowchart && (mcfg.secure || []).indexOf('securityLevel') >= 0 && !/securityLevel:\s*'(loose|antiscript|sandbox)'/.test(bootDiagram)
        && /securityLevel: m === 'strict' \? 'strict' : \(window\.wpMermaidConfig\.securityLevel \|\| 'loose'\)/.test(readOr('handbook.js')) && ['docpanel.js', 'popout.js'].every(f => { const b = fs.readFileSync(path.join(dir, f), 'latin1'); return /securityLevel: 'strict'/.test(b) && !/securityLevel: '(loose|antiscript|sandbox)'/.test(b); }), mcfg.securityLevel);
    check('mermaid config (text style): a styled flowchart label needs nothing new from it — the label rules are exactly as they were: the style and href attributes (and src, srcset) are still forbidden, so a label carries no link and no inline style; the plain tags a label\'s runs are written in (b, i, u, s, font with its color, big, small, br) are not forbidden and not cut down to an allow-list',
        fa.indexOf('style') >= 0 && fa.indexOf('href') >= 0 && fa.indexOf('xlink:href') >= 0 && fa.indexOf('src') >= 0 && fa.indexOf('srcset') >= 0 && ['b', 'i', 'u', 's', 'font', 'big', 'small', 'br'].every(t => ft.indexOf(t) < 0) && fa.indexOf('color') < 0 && !('ALLOWED_TAGS' in dp) && !('ALLOWED_ATTR' in dp)
        && JSON.stringify(ft) === JSON.stringify(['style', 'img', 'image', 'picture', 'source', 'video', 'audio', 'track', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'svg', 'mglyph', 'form', 'input', 'button']) && JSON.stringify(fa) === JSON.stringify(['style', 'src', 'srcset', 'href', 'xlink:href', 'background', 'poster', 'action', 'formaction', 'ping'])
        && !/<a\b|href/i.test(DR.compileFlowchart({ nodes: [{ id: 'a', text: 'x', fmt: { link: 'https://ok.example/', u: true, st: true, spans: [{ s: 0, e: 1, size: 'large', link: 'https://b.example/' }] } }], edges: [{ from: 'a', to: 'a', text: 'e', fmt: { link: 'https://ok.example/' } }] })), [ft, fa]);

    /* ---- cluster P of the outside audit: the page runs only the app's own files (the policy both servers send says so; a script written into the page or a handler attribute would simply stop working) ---- */
    {
        const j = JSON.stringify, crypto = require('crypto'), appDir = path.join(dir, '..'), repo = path.join(appDir, '..', '..'), vendor = path.join(appDir, 'assets', 'vendor');
        const scriptNames = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort(), allScripts = scriptNames.map(f => [f, read(f)]);
        check('mermaid config: there is one, in scripts/bootdiagram.js — the page holds none of its own and no other script writes it — and it starts the library once the page is parsed',
            !!mm && (idx + allScripts.map(p => p[1]).join('\n')).split('window.wpMermaidConfig = ').length === 2 && !/wpMermaidConfig/.test(idx) && /document\.addEventListener\("DOMContentLoaded", function\(\) \{\n\s*if \(window\.mermaid\) \{\n\s*mermaid\.initialize\(window\.wpMermaidConfig\);/.test(bootDiagram));
        // every <script> of the page, as the parser reads them
        const tags = []; { const reS = /<script\b([^>]*)>([\s\S]*?)<\/script>/g; let m; while ((m = reS.exec(idx))) tags.push({ attrs: m[1], body: m[2], at: m.index }); }
        const srcOf = t => (/\ssrc="([^"]*)"/.exec(t.attrs) || [])[1], outside = v => typeof v !== 'string' || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(v);
        const links = idx.match(/<link\b[^>]*>/g) || [], hrefOf = l => (/\shref="([^"]*)"/.exec(l) || [])[1];
        const headEnd = idx.indexOf('</head>');
        check('the page (index.html) holds no script of its own: every <script> names a file — none is written into the page — and each is a plain classic script or a module with nothing else on its tag; no script or stylesheet comes from another address (no scheme, no //); all of them are in the head; the page carries no policy of its own in a <meta> (the policy is the servers\' header, so Developer mode can add to it), no handler attribute on any element, no javascript: address, and no <base>, <iframe>, <object>, <embed> or <form>',
            tags.length >= 45 && (idx.match(/<script\b/g) || []).length === tags.length && tags.every(t => t.body === '' && /^( type="module")? src="[^"]+"$/.test(t.attrs) && !outside(srcOf(t)) && t.at < headEnd) && links.length >= 2 && links.every(l => !outside(hrefOf(l)))
            && !/http-equiv/i.test(idx) && !/<[a-zA-Z][^<>]*\son[a-z]+\s*=/.test(idx) && !/javascript:/i.test(idx) && !/<(base|iframe|object|embed|form)\b/i.test(idx),
            [tags.length, tags.filter(t => t.body !== '' || !/^( type="module")? src="[^"]+"$/.test(t.attrs) || outside(srcOf(t))).map(t => (t.attrs + ' ' + t.body).slice(0, 80)), links.filter(l => outside(hrefOf(l))), (/<[a-zA-Z][^<>]*\son[a-z]+\s*=/.exec(idx) || [''])[0].slice(0, 120)]);
        const seq = tags.map(t => (/type="module"/.test(t.attrs) ? 'm:' : 'c:') + srcOf(t)), firstMod = seq.findIndex(x => x.indexOf('m:') === 0), lastMod = seq.length - 1 - seq.slice().reverse().findIndex(x => x.indexOf('m:') === 0);
        const sheetAt = idx.indexOf('<link rel="stylesheet" href="style.css">');
        const boots = { 'boottheme.js': "try { if (localStorage.getItem('wp_theme') === 'light') document.documentElement.setAttribute('data-theme', 'light'); } catch (e) {}", 'booterror.js': 'function showErrorBanner(text, color, top) {', 'bootprefs.js': 'window.wpPrefsPush = push;', 'bootdiagram.js': 'mermaid.initialize(window.wpMermaidConfig);' };
        check('the four scripts that were written into the page run where and when they did, each now a classic script file of the app: the theme first of all and before the stylesheet; the error banner after the stylesheet and before every other script; the settings mirror directly after /api/prefs.js and before the first module (modules wait for the whole page, so the file\'s settings are merged before any of them reads one); the diagram config last, directly after the three bundled libraries; each file holds the code and the page holds none of it',
            j(seq.slice(0, 4)) === j(['c:scripts/boottheme.js', 'c:scripts/booterror.js', 'c:/api/prefs.js', 'c:scripts/bootprefs.js']) && firstMod === 4 && j(seq.slice(lastMod + 1)) === j(['c:scripts/tooltips.js', 'c:assets/vendor/peerjs.min.js', 'c:assets/vendor/mermaid.min.js', 'c:assets/vendor/html2canvas.min.js', 'c:scripts/bootdiagram.js'])
            && seq.slice(firstMod, lastMod + 1).every(x => x.indexOf('m:scripts/') === 0) && sheetAt > tags[0].at && sheetAt < tags[1].at
            && Object.keys(boots).every(f => readOr(f).split(boots[f]).length === 2 && idx.indexOf(boots[f]) < 0 && !/^\s*(import|export)\s/m.test(readOr(f))), [seq.slice(0, 5), seq.slice(lastMod), sheetAt > 0]);

        // the three libraries are files of the app
        const LIBS = [['peerjs.min.js', '29e6ad48ce4552a35a348dc55ee7a5657db89cf9de229dbc56292d1be35867e8', '1.5.2', 'PeerJS'], ['mermaid.min.js', '8d607d7ef1d077a8aa202e18e62212bfa992c68bfeabc5cf45d51a128fe6675d', '10.9.8', 'Mermaid'], ['html2canvas.min.js', 'e87e550794322e574a1fda0c1549a3c70dae5a93d9113417a429016838eab8cb', '1.4.1', 'html2canvas']];
        const bytesOf = f => { try { return fs.readFileSync(path.join(vendor, f)); } catch (e) { return null; } }, shaOf = b => (b ? crypto.createHash('sha256').update(b).digest('hex') : 'no file');
        const licOf = f => { try { return fs.readFileSync(path.join(vendor, f.replace(/\.min\.js$/, '.LICENSE.txt')), 'utf8'); } catch (e) { return ''; } };
        const vendorLs = (() => { try { return fs.readdirSync(vendor).sort(); } catch (e) { return []; } })();
        const attrs = (() => { try { return fs.readFileSync(path.join(repo, '.gitattributes'), 'utf8').split(/\r?\n/); } catch (e) { return []; } })();
        const iss = (() => { try { return fs.readFileSync(path.join(repo, 'installer.iss'), 'utf8'); } catch (e) { return ''; } })(), excl = (/Excludes: "([^"]*)"/.exec(iss) || ['', 'none'])[1].split(',');
        check('bundled libraries: PeerJS 1.5.2, the diagram library 10.9.8 and html2canvas 1.4.1 are files of the app (assets/vendor), each the pinned file byte for byte (SHA-256) with its licence text beside it (the MIT permission notice, the file\'s version and its SHA-256) and nothing else in the folder; git keeps their bytes on every checkout (.gitattributes: binary); the installer leaves the folder in; the page loads each once, and no script of the app names the folder or the CDN they came from',
            LIBS.every(l => shaOf(bytesOf(l[0])) === l[1] && /Permission is hereby granted, free of charge/.test(licOf(l[0])) && /MIT License/.test(licOf(l[0])) && /Copyright \(c\) /.test(licOf(l[0])) && licOf(l[0]).indexOf(l[3] + ' ' + l[2] + ' (' + l[0] + ')') === 0 && licOf(l[0]).indexOf('SHA-256 ' + l[1]) > 0)
            && j(vendorLs) === j(['html2canvas.LICENSE.txt', 'html2canvas.min.js', 'mermaid.LICENSE.txt', 'mermaid.min.js', 'peerjs.LICENSE.txt', 'peerjs.min.js']) && attrs.indexOf('system/app/assets/vendor/*.js binary') >= 0
            && excl.length > 10 && !excl.some(x => /vendor|assets|^system(\\\*)?$|^system\\app(\\|$)|^\*(\.(js|txt|\*))?$/i.test(x.trim())) && LIBS.every(l => idx.split('<script src="assets/vendor/' + l[0] + '"></script>').length === 2) && (idx.match(/assets\/vendor\//g) || []).length === 3
            && !/cdnjs|cloudflare|unpkg|jsdelivr/i.test(idx) && allScripts.every(p => !/cdnjs|assets\/vendor/i.test(p[1])), [LIBS.map(l => shaOf(bytesOf(l[0])) === l[1]), vendorLs, allScripts.filter(p => /cdnjs|assets\/vendor/i.test(p[1])).map(p => p[0])]);
        const guide = (() => { try { return fs.readFileSync(path.join(repo, 'CAMPAIGN_INTEGRATION.md'), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } })();
        const guideLine = (guide.split('\n').filter(l => l.indexOf('"type": "diagram"') >= 0)[0] || '');
        check('bundled libraries: the integration guide says of a diagram block what the app does — drawn by the bundled diagram library at the pinned version, with no connection — and nowhere that a diagram needs the internet, comes from a CDN or is drawn by the version the app left',
            guideLine.indexOf('mermaid ' + LIBS[1][2]) > 0 && /bundled/.test(guideLine) && /no connection/i.test(guideLine) && !/needs internet|loaded from CDN|from a CDN|cdnjs|10\.9\.1/i.test(guide), guideLine.slice(0, 200));
        const mmLib = bytesOf('mermaid.min.js'), mmVer = LIBS[1][2].split('.').map(Number);
        check('mermaid: the bundled build is past the sequence-label fix (10.9.4 or later) and on the 10 line, never 11 (handbook.js and this suite rely on mermaid 10\'s run() reading a pre\'s markup); the file says the version the pin names',
            mmVer.length === 3 && mmVer[0] === 10 && (mmVer[1] > 9 || (mmVer[1] === 9 && mmVer[2] >= 4)) && !!mmLib && mmLib.indexOf('="' + LIBS[1][2] + '"') > 0 && mmLib.indexOf('="10.9.1"') < 0, [mmVer, !!mmLib]);

        // a page pop-out hides everything on the page but its own wrap; the diagram library measures a label's text in a bare <svg> it adds to the body for
        // the moment (hidden, it measures nothing and throws: a sequence diagram then showed "Syntax error in text"), and lays a diagram out in an element
        // of its own (id "d" + the diagram's id, "mermaid-N") when it is given no place for it
        const cssS = (() => { try { return fs.readFileSync(path.join(appDir, 'style.css'), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } })(), hideRule = (cssS.match(/\n\s*body\.popout-mode > \*[^{\n]*\{ display: none !important; \}/) || [''])[0].trim();
        const mmTxt = mmLib ? mmLib.toString('latin1') : '', bodyTop = idx.slice(idx.indexOf('<body>')).split('\n').filter(l => /^<[a-zA-Z]/.test(l)).map(l => (/^<([a-zA-Z0-9]+)/.exec(l) || [])[1].toLowerCase());
        check('mermaid in a page pop-out: the rule that hides the rest of the page leaves what the diagram library adds to the page while it draws — the bare <svg> it measures text in and its own layout element (id starting "dmermaid") — beside the pop-out\'s own wrap and the chat panel; the page itself holds no <svg> directly under its body, so nothing else shows; the bundled library still measures so (an svg appended to the body, an error when it is not rendered) and still names its element so ("d" + the id, the id "mermaid-" + a number)',
            hideRule === 'body.popout-mode > *:not(#popoutWrap):not(#chatPanel):not(#customConfirm):not(svg):not([id^="dmermaid"]) { display: none !important; }' && (cssS.match(/body\.popout-mode > \*/g) || []).length === 1
            && bodyTop.length > 20 && bodyTop.indexOf('svg') < 0 && /=[A-Za-z_$]+\("body"\);if\(![A-Za-z_$]+\.remove\)return\{width:0,height:0,lineHeight:0\};const [A-Za-z_$]+=[A-Za-z_$]+\.append\("svg"\)/.test(mmTxt) && mmTxt.indexOf('throw new Error("svg element not in render tree")') > 0
            && /="d"\+[A-Za-z_$]+,/.test(mmTxt) && mmTxt.indexOf('`mermaid-${') > 0, [hideRule, bodyTop.length, bodyTop.indexOf('svg')]);

        // no script of the app writes what the policy would refuse, or steps around it
        // the event names an element takes as an attribute (a variable called once or ongoing is no handler)
        const EV = '(?:abort|animation\\w+|auxclick|before\\w+|afterprint|blur|cancel|canplay\\w*|change|click|close|contextmenu|copy|cuechange|cut|dblclick|drag\\w*|drop|durationchange|emptied|ended|error|focus(?:in|out)?|formdata|fullscreen\\w+|gotpointercapture|hashchange|input|invalid|key(?:down|press|up)|languagechange|load\\w*|lostpointercapture|message(?:error)?|mouse\\w+|offline|online|page(?:hide|show)|paste|pause|play(?:ing)?|pointer\\w+|popstate|progress|ratechange|readystatechange|reset|resize|scroll(?:end)?|search|securitypolicyviolation|seek(?:ed|ing)|select\\w*|slotchange|stalled|storage|submit|suspend|timeupdate|toggle|touch\\w+|transition\\w+|unhandledrejection|rejectionhandled|unload|volumechange|waiting|webkit\\w+|wheel|begin|end|repeat|show)';
        const SCAN = [['a handler attribute in markup', new RegExp('[\\s"\'<]on' + EV + '\\s*=\\s*\\\\?["\']', 'gi')], ['a handler attribute in a tag', new RegExp('<[a-zA-Z][^<>\\n]{0,300}?\\son' + EV + '\\s*=', 'gi')], ['a handler set as an attribute', /setAttribute\(\s*["'`]on|setAttributeNS\(\s*[^,()]*,\s*["'`]on/gi], ['a javascript: address', /["'`]\s*javascript:/gi],
            ['text run as code', /\bnew\s+Function\b|\bFunction\s*\(|\.constructor\s*\(|\[\s*["'`]constructor["'`]\s*\]\s*\(|\bset(Timeout|Interval)\(\s*["'`]|\bdocument\.write(ln)?\(|\bimportScripts\(|\beval\s*\(/g], ['a script element made by hand', /createElement\(\s*["'`]script["'`]\s*\)/gi],
            ['a module or worker from somewhere else', /\bimport\(\s*(?!["']\.\/[\w.-]+["']\s*\))|^\s*import\s[^\n]*?\bfrom\s+["'](?!\.\/)|^\s*import\s+["'](?!\.\/)|\bnew\s+(Shared)?Worker\(|serviceWorker/gm]];
        const scan = src => { const out = []; SCAN.forEach(p => { p[1].lastIndex = 0; let m; while ((m = p[1].exec(src))) { out.push(p[0] + ': ' + src.slice(Math.max(0, m.index - 30), m.index + 50).replace(/\s+/g, ' ')); if (m.index === p[1].lastIndex) p[1].lastIndex++; } }); return out; };
        const found = []; allScripts.forEach(p => scan(p[1]).forEach(x => found.push(p[0] + ' — ' + x)));
        const indirect = allScripts.map(p => [p[0], (p[1].match(/\(0, eval\)\(/g) || []).length]).filter(p => p[1] > 0), anyEval = allScripts.filter(p => /\beval\b\s*[),(]/.test(p[1])).map(p => p[0]);
        const probe = ['el.innerHTML = \'<b onclick="go()">x</b>\';', 'h += "<img src=x onerror=\\"go()\\">";', 'el.setAttribute(\'onclick\', \'go()\');', 'a.href = "javascript:go()";', 'var f = new Function("return 1");', 'setTimeout("go()", 5);', 'var s = document.createElement("script");', 'import("https://example.com/x.js");', 'import(name);', 'new Worker("w.js");', 'x = eval("1");',
            'var f = Function("return 1");', 'var g = window.Function("a", "return a");', 'x = (function() {}).constructor("return 1")();', 'x = go["constructor"](code)();', 'el.setAttribute("on" + n, code);', 'el.setAttribute(`on${n}`, code);', 'el.setAttributeNS(null, "onclick", code);'];
        const fine = ['el.onclick = function() {};', 'el.addEventListener("click", go);', 'import(\'./dialogs.js\').then(go);', 'import { a } from \'./state.js\';', 'setTimeout(function() {}, 5);', 'var ongoing = "x", once = "y", only = \'z\'; if (ongoing === "y") {}', '// the import (a Merge or a Replace) is cleaned first','h += \'<span title="carry on = yes">\';',
            'if (typeof f === "function") f();', 'function isFunction(v) { return typeof v === "function"; }', 'el.setAttribute("aria-pressed", "on");', 'el.setAttribute("data-kind", only);', 'if (Object.prototype.hasOwnProperty.call(o, "constructor")) return null;', 'var BAD = ["__proto__", "constructor", "prototype"];'];
        check('no script of the app writes a handler attribute or a javascript: address into markup, runs text as code, makes a script element by hand or loads a module or worker from anywhere but the app\'s own scripts folder (every file in system/app/scripts scanned; the scan itself proven on a line of each kind, and quiet on the ways the app does wire a handler); the one place text is run as code is the Developer mode console (devconsole.js, twice: the typed line, and the probe that tells a refusal by the page\'s policy from an error of the typed line)',
            scriptNames.length >= 50 && found.length === 0 && probe.every(l => scan(l).length > 0) && fine.every(l => scan(l).length === 0) && j(indirect) === j([['devconsole.js', 2]]) && j(anyEval) === j(['devconsole.js']), [found.slice(0, 6), probe.filter(l => scan(l).length === 0), fine.filter(l => scan(l).length > 0), indirect, anyEval]);
    }

    /* ---- docrender: a page's layout numbers even when it never met cleanDoc ---- */
    let dHtml = '';
    const rawDoc = { type: 'doc', meta: {}, blocks: [
        { type: 'image', src: '/saves/images/a.png', layout: { width: '50%;background:url(//evil.example/l)', dx: '1px;color:red', dy: 7, float: 'left' } },
        { type: 'callout', content: 'x', layout: { width: 33, dx: 999 } },
        { type: 'flowchart', nodes: { a: 1 }, edges: 'x', layout: { dx: '1;background:url(//evil.example/x)', dy: 3 } },
        { type: 'flowchart', nodes: [null, { id: 'a', text: T }], edges: [null, { from: 'a', to: 'a' }] }
    ] };
    check('renderDoc: an uncleaned page renders without a crash', throwsNot(function() { dHtml = DR.renderDoc(rawDoc); }));
    check('renderDoc: nothing in it can run or call out', risks(dHtml).length === 0, risks(dHtml));
    check('renderDoc: layout numbers are numbers, clamped as cleanDoc would', dHtml.indexOf('style="position:relative;left:0px;top:7px;"') >= 0 && dHtml.indexOf('style="width:33%;position:relative;left:200px;top:0px;"') >= 0 && dHtml.indexOf('left:0px;top:3px;') >= 0);
    const cleanD = DR.cleanDoc({ type: 'doc', meta: {}, blocks: [{ type: 'callout', content: 'x', layout: { width: 50, dx: 8, dy: -4, float: 'right' } }] });
    check('renderDoc: a cleaned page\'s layout is byte-for-byte as before', DR.renderDoc(cleanD).indexOf('<div class="callout fl-right" style="width:50%;position:relative;left:8px;top:-4px;">') >= 0);
    check('compileFlowchart: a node or edge that is not an object is skipped', throwsNot(function() { DR.compileFlowchart({ nodes: [null, 'x', { id: 'a' }], edges: [null, 5, { from: 'a', to: 'a' }] }); }) && throwsNot(function() { DR.compileFlowchart({ nodes: {}, edges: {} }); }));

    /* ---- the room inspector (inspector.js getRoomInspectorHtml + landingRoomFieldHtml) ---- */
    const KEY = 'k" onmouseover="alert(1)';
    const campR = { id: 'c1', items: {
        here: { id: 'here', type: 'map', meta: { title: 'Here' } },
        [P]: { id: P, type: 'map', meta: { title: T } },
        dest: { id: 'dest', type: 'map', meta: { title: 'Dest' }, rooms: [{ id: P, name: T }, { id: 'r2', name: 'Two' }] }
    } };
    const mapR = { id: 'here', type: 'map', meta: { title: 'Here' }, rooms: [], cats: { [KEY]: { label: T, color: 'red;background:url(//evil.example/c)' }, ok: { label: 'Ok', color: '#4db3d3' }, broken: null } };
    const roomR = { id: 'r1', name: T, cat: KEY, image: U, notes: T, icon: T, handoutId: P, targetMapId: 'dest', targetRoomId: P,
        characters: [{ name: T, info: T, portrait: '//evil.example/p.png', ref: P }, { name: 'Ok', portrait: '/saves/images/r1/face.png' }] };
    const envR = {
        getActiveMap: () => mapR, getActiveCampaign: () => campR, state: { viewMode: 'data' },
        getMapChildren: (c, parentId) => Object.keys(c.items).map(k => c.items[k]).filter(it => it.type === 'map' && ((it.meta && it.meta.parentId) || null) === parentId),
        findLandingRoom: (src, dest) => dest.rooms[0],
        window: { wpHandoutList: () => [{ id: P, title: T }] }
    };
    const room = new Function('env', 'esc', 'cssColor', 'picRef',
        'var getActiveMap = env.getActiveMap, getActiveCampaign = env.getActiveCampaign, state = env.state, getMapChildren = env.getMapChildren, findLandingRoom = env.findLandingRoom, window = env.window;\n'
        + slice('inspector.js', 'room') + slice('inspector.js', 'landing') + '\nreturn getRoomInspectorHtml;')(envR, SC.esc, SC.cssColor, SC.picRef);
    let rHtml = '';
    check('room inspector: a hostile room and map render without a crash', throwsNot(function() { rHtml = room(roomR, mapR); }));
    check('room inspector: nothing in it can run or call out', risks(rHtml).length === 0, risks(rHtml));
    check('room inspector: a category colour from the file falls back to the default', rHtml.indexOf('border-left: 4px solid #c9c9d4; color: #c9c9d4;') >= 0 && rHtml.indexOf('id="fCatColor" value="#c9c9d4"') >= 0 && rHtml.indexOf('style="color:#4db3d3; font-weight:bold;"') >= 0);
    check('room inspector: the web picture and portrait are not shown, the library portrait is', rHtml.indexOf('room-image-preview') < 0 && rHtml.indexOf('src="/saves/images/r1/face.png"') >= 0 && rHtml.split('class="char-portrait"').length === 2);
    check('room inspector: ids stay whole in their attributes', rHtml.indexOf('value="' + SC.esc(KEY) + '" selected') >= 0 && rHtml.indexOf('<option value="' + SC.esc(P) + '"') >= 0);

    /* ---- pictures on the play map and the sheet (whiteboard.js resolveImg, sheets.js imgSrc) ---- */
    const mkResolve = w => new Function('window', 'picRef', slice('whiteboard.js', 'resolveimg') + '\nreturn resolveImg;')(w, SC.picRef);
    const gmSolo = mkResolve({}), gmHost = mkResolve({ wpNet: { assetSrc: p => p } });
    [gmSolo, gmHost].forEach(function(f, i) {
        const who = i ? 'hosting' : 'solo';
        check('resolveImg (' + who + '): a web picture never loads', f(U) === '' && f('//evil.example/a.png') === '' && f(undefined) === '');
        check('resolveImg (' + who + '): the app\'s own pictures load as before', f('/saves/images/m1/a b.png') === '/saves/images/m1/a b.png' && f('assets/tutorial/inn.webp') === 'assets/tutorial/inn.webp' && f('data:image/png;base64,AAAA') === 'data:image/png;base64,AAAA');
    });
    const player = mkResolve({ wpNet: { assetSrc: p => /^[a-z]+:|^\/\//i.test(p) ? 'PLACEHOLDER' : /^\/saves\//.test(p) ? 'blob:cached' : p } });
    check('resolveImg (player): unchanged — net.assetSrc answers (placeholder, cached bytes)', player(U) === 'PLACEHOLDER' && player('/saves/images/a.png') === 'blob:cached' && player('assets/x.png') === 'assets/x.png');
    const sheetImg = w => new Function('net', 'picRef', slice('sheets.js', 'sheetimg') + '\nreturn imgSrc;')(() => w, SC.picRef);
    check('sheet portrait: a web picture never loads for the GM; a player\'s goes through net.assetSrc', sheetImg(null)(U) === '' && sheetImg(null)('/saves/images/a.png') === '/saves/images/a.png' && sheetImg({ assetSrc: () => 'PLACEHOLDER' })(U) === 'PLACEHOLDER');

    /* ---- the ruler's unit (whiteboard.js mapMeasureConfig + measureLabel): it lands in the ruler's SVG markup ---- */
    const measure = (meta, grid) => new Function('getActiveMap', 'state', '_r1', slice('whiteboard.js', 'measure') + '\nreturn { mapMeasureConfig: mapMeasureConfig, measureLabel: measureLabel };')(() => ({ meta: meta }), { gridType: grid || 'square' }, n => Math.round(n * 10) / 10);
    check('ruler: a unit the Measure menu does not offer becomes the grid\'s default', measure({ cellUnit: T }).measureLabel(100) === '2 sq \u00b7 10 ft' && measure({ cellUnit: 'constructor' }, 'hex').mapMeasureConfig().unit === 'yd');
    check('ruler (turn-based combat T1): the cells the system\'s diagonal rule gives replace the straight count; none keeps it', measure({}, 'square').measureLabel(291.5, 6) === '6 sq \u00b7 30 ft' && measure({}, 'square').measureLabel(100, null) === '2 sq \u00b7 10 ft');
    check('ruler: the offered units read as before', measure({ cellUnit: 'mi', cellValue: 5 }).measureLabel(50) === '1 sq \u00b7 5 mi' && measure({ cellUnit: 'm' }).mapMeasureConfig().unit === 'm');

    /* ---- music: the GM's machine fetches only the campaign's own uploads (music.js bytesFor) ---- */
    const fetched = [];
    const bytesFor = (client) => new Function('bytes', 'isClient', 'isUploadPath', 'fetch', 'net', 'LIMITS', slice('music.js', 'musicbytes') + '\nreturn bytesFor;')({}, () => client, SND.isUploadPath, u => { fetched.push(u); return Promise.resolve({ ok: true, blob: () => Promise.resolve({ size: 1 }) }); }, () => ({ fetchAsset: (p) => { fetched.push('asset:' + p); return Promise.resolve({ size: 1 }); } }), { file: 1e9 });
    const gmBytes = bytesFor(false);
    const outcomes = await Promise.all([U, '/saves/images/../data.json', '/saves/images/audio/c1/song.mp3'].map(p => gmBytes({ path: p }).then(() => 'ok', () => 'refused')));
    check('music (GM): a web address or a path outside the uploads is refused before any fetch', outcomes[0] === 'refused' && outcomes[1] === 'refused' && fetched.indexOf(U) < 0 && !fetched.some(f => /data\.json/.test(f)));
    check('music (GM): a campaign upload is fetched as before', outcomes[2] === 'ok' && fetched.indexOf('/saves/images/audio/c1/song.mp3') >= 0);
    await bytesFor(true)({ path: '/saves/images/audio/c1/b.mp3', size: 1 });
    check('music (player): unchanged — the host is asked for the bytes', fetched.indexOf('asset:/saves/images/audio/c1/b.mp3') >= 0);

    /* ---- deleting a category's files (whiteboard.js catFilesToDelete): only the category's own ---- */
    const catFiles = new Function(slice('whiteboard.js', 'catfiles') + '\nreturn catFilesToDelete;')();
    const owners = { '/saves/images/mine/a.png': ['c1'], '/saves/images/victim/b.png': ['c2'], '/saves/images/both/c.png': ['c1', 'c2'], '/saves/images/gone/d.png': [], '/saves/images/tutorial/e.png': 'shared' };
    const paths = Object.keys(owners), own = p => owners[p];
    const inCamp = catFiles(paths, 'c1', own), inShared = catFiles(paths, 'shared', own);
    check('category files: a campaign\'s category takes its own and nobody\'s pictures only', JSON.stringify(inCamp.go) === JSON.stringify(['/saves/images/mine/a.png', '/saves/images/gone/d.png']));
    check('category files: another campaign\'s picture, a shared one and the tutorial art keep their files', JSON.stringify(inCamp.kept) === JSON.stringify(['/saves/images/victim/b.png', '/saves/images/both/c.png', '/saves/images/tutorial/e.png']));
    check('category files: a shared category takes only pictures no campaign holds', JSON.stringify(inShared.go) === JSON.stringify(['/saves/images/gone/d.png', '/saves/images/tutorial/e.png']) && inShared.kept.length === 3);

    /* ---- the module publishes itself for non-module code ---- */
    global.window = {};
    const SC2 = await import(modUrl('safecore.js') + '?w');
    check('window.wpSafeCore published with the API', !!(global.window.wpSafeCore && global.window.wpSafeCore.picRef && global.window.wpSafeCore.VERSION === SC2.VERSION));
    /* ---- Stage 6 U3: the GM's review of a player's sheet upload (sheets.js openReview): every text of it came from a player's file ---- */
    {
        const SYC = await import(modUrl('systemcore.js'));
        const made = [], htmlSet = [];
        const fake = tag => { const e = { tag, children: [], style: {}, className: '', textContent: '', appendChild(k) { this.children.push(k); return k; }, addEventListener() {} }; Object.defineProperty(e, 'innerHTML', { set(v) { htmlSet.push(v); }, get() { return ''; } }); made.push(e); return e; };
        const nodes = { uploadModal: fake('div'), uploadHead: fake('h3'), uploadList: fake('div'), uploadApply: fake('button'), uploadReject: fake('button') };
        const T = '<img src=x onerror=alert(1)>', queue = [{ id: 'up_a', charId: 'c_1', from: 'u_a', name: T + 'Pat', at: 1, changes: [{ id: 'u_1', kind: 'value', f: 'f_st', label: T, from: '"><script>x()</script>', to: '<b onmouseover=y()>', value: 1, accept: true }, { id: 'u_2', kind: 'explode', f: 'f_st', label: T }] }];
        const camp = { uploads: queue, chars: { c_1: { id: 'c_1', name: T + 'Ana', values: {} } } };
        const el = (tag, cls, text) => { const e = fake(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
        const openReview = new Function('ui', 'getActiveCampaign', 'uploadsOf', 'charById', 'isClient', 'el', 'systemOf', 'F', 'sbApplyProposal', 'afterCharChange', 'net', 'toast', 'save', 'renderViews', 'closeReview', 'var _review = null, lastChange = null;\n' + slice('sheets.js', 'uploadreview') + '\nreturn openReview;')(
            id => nodes[id], () => camp, (cp, id) => SYC.cleanUploads(cp.uploads).filter(u => u.charId === id), (id, cp) => cp.chars[id] || null, () => false, el, () => null, () => null, () => ({}), () => {}, () => null, () => {}, () => {}, () => {}, () => {});
        openReview('c_1');
        const texts = made.map(e => e.textContent).filter(Boolean), rows = nodes.uploadList.children;
        check('upload review: a player\'s names, labels and values reach the review as text only (never innerHTML); a change of an unknown kind is left out; the window opens',
            htmlSet.length === 0 && !/innerHTML|insertAdjacentHTML|outerHTML/.test(slice('sheets.js', 'uploadreview')) && rows.length === 1 && texts.indexOf(T) >= 0 && texts.indexOf('"><script>x()</script>') >= 0 && texts.indexOf('<b onmouseover=y()>') >= 0
            && nodes.uploadHead.textContent.indexOf(T + 'Pat') === 0 && nodes.uploadModal.style.display === 'flex', JSON.stringify([htmlSet, rows.length, nodes.uploadHead.textContent]));
    }

    /* ---- Onboarding F1a: a waiting token's face (whiteboard.js) — a picture from the roster only when it passes safeAvatar, a colour through cssColor ---- */
    {
        const netSrcW = read('net.js'), hA = netSrcW.indexOf('// [netcheck:helpers-start]'), hB = netSrcW.indexOf('// [netcheck:helpers-end]');
        const HW = new Function('localStorage', 'crypto', netSrcW.slice(hA, hB) + '\nreturn { safeAvatar, faceView, cleanFace };')({ getItem: () => null, setItem() {} }, globalThis.crypto);
        const safeAvatar = HW.safeAvatar;
        const face = (avatar, color, name, chosen) => {
            const kids = [], el = { dataset: {}, classList: { add() {}, toggle() {} }, set textContent(v) { kids.length = 0; }, set innerHTML(v) { throw new Error('innerHTML'); }, querySelector: (sel) => kids.find(k => (/emoji/.test(sel) ? k.cls === 'wait-emoji' : k.cls !== 'wait-emoji')) || null, appendChild(k) { kids.push(k); } };
            const doc = { createElement: () => { const o = { attrs: {}, getAttribute(k) { return this.attrs[k] || null; } }; Object.defineProperty(o, 'src', { set(v) { o.attrs.src = String(v); }, get() { return o.attrs.src; } }); Object.defineProperty(o, 'className', { set(v) { o.cls = v; }, get() { return o.cls; } }); return o; } };
            const win = { wpNet: { roster: { pA: { id: 'u_a', avatar, color, face: chosen } }, safeAvatar, faceView: (p, c) => HW.faceView(p, c, cc => 'DEFAULT(' + cc + ')') }, wpDefaultAvatar: c => 'DEFAULT(' + c + ')' };
            new Function('item', 'el', 'window', 'document', 'cssColor', slice('whiteboard.js', 'waitingface'))({ waiting: 1, ownerId: 'u_a', name, color: '#112233' }, el, win, doc, SC.cssColor);
            const em = kids.find(k => k.cls === 'wait-emoji');
            return { src: kids[0] && kids[0].attrs.src, tip: el.dataset.tip, emoji: em ? em.textContent : undefined };
        };
        const away = (() => { const kids = [], el = { dataset: {}, classList: { add() {}, toggle() {} }, set textContent(v) { kids.length = 0; }, querySelector: () => kids[0] || null, appendChild(k) { kids.push(k); } }; const doc = { createElement: () => { const o = { attrs: {}, getAttribute(k) { return this.attrs[k] || null; } }; Object.defineProperty(o, 'src', { set(v) { o.attrs.src = String(v); }, get() { return o.attrs.src; } }); return o; } };
            new Function('item', 'el', 'window', 'document', 'cssColor', slice('whiteboard.js', 'waitingface'))({ waiting: 1, ownerId: 'u_gone', name: 'Bo', color: '#112233', face: 'pic:orc' }, el, { wpNet: { roster: {}, safeAvatar, faceView: (p, c) => HW.faceView(p, c, cc => 'DEFAULT(' + cc + ')') } }, doc, SC.cssColor); return kids[0] && kids[0].attrs.src; })();
        check('F1b waiting face while its player is away (no roster entry): the face the token kept, through the same rule', away === 'assets/tutorial/orc_sq.jpg', away);
        check('F1b the party chip of an emoji face is a span whose text goes through esc (never raw into the strip\'s markup)', /if \(c\.emoji\) return '<span class="' \+ cls \+ ' party-face party-emoji" data-key="' \+ esc\(c\.key\) \+ '" data-tip="' \+ esc\(tip\) \+ '">' \+ esc\(c\.emoji\) \+ '<\/span>';/.test(read('whiteboard.js')));
        const picked = face('data:image/png;base64,AAAA', '#445566', 'Ana', 'pic:orc'), picBad = face('data:image/png;base64,AAAA', '#445566', 'Ana', 'pic:https://evil.example/x'), emo = face(undefined, '#445566', 'Ana', '\u{1F409}');
        check('F1b waiting face: a bundled picture is the app\'s own asset; a face the rule refuses (a web address dressed as a picture) falls back to their checked picture; an emoji face is text in a span, never markup',
            picked.src === 'assets/tutorial/orc_sq.jpg' && picBad.src === 'data:image/png;base64,AAAA' && emo.emoji === '\u{1F409}', JSON.stringify([picked, picBad, emo]));
        const ok = face('data:image/png;base64,AAAA', '#445566', 'Ana');
        const bad = ['javascript:alert(1)', 'https://evil.example/x.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,AA" onerror="x', '//evil/x.png'].map(a => face(a, 'red;background:url(//evil/x)', '<img src=x onerror=alert(1)>'));
        check('F1a waiting face: a roster picture reaches the token only when the whole string passes safeAvatar; anything else (a web or script address, an SVG, a quote-breaking tail) shows the silhouette, whose colour goes through cssColor; the name is only a tooltip (text, never markup)',
            ok.src === 'data:image/png;base64,AAAA' && ok.tip === 'Ana \u2014 waiting for a character' && bad.every(r => /^DEFAULT\(/.test(r.src) && !/evil|url\(/.test(r.src)) && bad[0].tip === '<img src=x onerror=alert(1)> \u2014 waiting for a character', JSON.stringify([ok, bad]));
    }
    /* ---- Onboarding F1a (review): the GM's own screens for a waiting token — its Properties panel builds text nodes only; every delete route keeps it away; a hidden stub never keeps its tooltip; an item menu never sits beside a player's ---- */
    {
        const insp = read('inspector.js'), wbS = read('whiteboard.js');
        const ia = insp.indexOf('            if (w.waiting) {'), ib = insp.indexOf('\n                return;\n            }\n', ia), panel = ia >= 0 && ib > ia ? insp.slice(ia, ib) : '';
        check('F1a waiting token Properties: its own panel (Give a character, Hide or Show, Remove) built from text nodes — never innerHTML with its name — and none of the shape panel (no Is Character, Player Owner or plain Delete)',
            panel.length > 200 && !/innerHTML|insertAdjacentHTML/.test(panel) && /wpH\.textContent = String\(w\.name \|\| 'A player'\)/.test(panel) && /inspector\.textContent = '';/.test(panel) && !/wbIsChar|wbOwner|wbDel/.test(panel), panel.slice(0, 200));
        check('F1a every GM delete route of a waiting token keeps it away this session (the Properties multi-delete, the element list, the selection toolbar, the Delete key, Cut, the item menu)',
            (insp.match(/window\.wpWaitingGone\(activeMap\.whiteboard\.filter\(/g) || []).length === 2 && /if \(window\.wpWaitingGone\) window\.wpWaitingGone\(its\);/.test(wbS) && /window\.wpWaitingGone = function\(items\) \{ \(items \|\| \[\]\)\.forEach\(function\(x\) \{ if \(x && x\.waiting && window\.wpNet && window\.wpNet\.noWaiting\) window\.wpNet\.noWaiting\(x\.ownerId\); \}\); \};/.test(wbS));
        check('hidden pieces (the owner\'s ruling of 2026-10-01): a hidden token\'s Properties offer no "New character from this token" — a roster entry\'s name is sent to players — but a line saying to show it first, and the handler refuses the pick if it comes anyway (as a drag never puts a hidden token in a room\'s roster, wpAutoRoom)',
            /\+ _rOpts \+ \(w\.hidden \? '' : '<option value="__new">\+ New character from this token<\/option>'\) \+ '<\/select>'\n\s*\+ \(w\.hidden \? '<div class="muted"[^\n]*A new roster entry waits until you show the token: a roster name is sent to players\./.test(insp)
            && /if \(v === '__new'\) \{\n\s*if \(w\.hidden\) \{ this\.value = ''; import\('\.\/io\.js'\)\.then\(function\(m\) \{ m\.toast\('Show the token first: a roster entry\\'s name is sent to players, and this token is hidden from them\.'\); \}\); return; \}/.test(insp)
            && /if \(item\.hidden\) return null;/.test(read('datamap.js')));
        check('F1a a hidden waiting token\'s stub loses the ring and the tooltip; a right-click on a waiting token (or a chip) closes an item menu left open; Player Owner giving a token on the map a player is on settles their waiting token',
            /el\.classList\.toggle\('wb-waiting', !!item\.waiting && !hideFromMe\);[^\n]*\n\s*if \(el\.dataset\.waitTip && \(!item\.waiting \|\| hideFromMe\)\) \{ delete el\.dataset\.tip; delete el\.dataset\.waitTip; \}/.test(wbS)
            && /var cmOld = document\.getElementById\('contextMenu'\); if \(cmOld\) cmOld\.style\.display = 'none';/.test(wbS)
            && /else if \(this\.value && window\.wpNet && window\.wpNet\.active && window\.wpNet\.role === 'host' && window\.wpNet\.reconcilePresence && [^\n]*p\.location === activeMap\.id\)\) window\.wpNet\.reconcilePresence\(this\.value, \{\}\);/.test(insp) && /var cmWt = document\.getElementById\('contextMenu'\); if \(cmWt\) cmWt\.style\.display = 'none';/.test(wbS));
    }
    /* ---- Onboarding F1c: a character's own picture (sheets.js applyCharFace, run for real) and its face on the token (whiteboard.js) ---- */
    {
        const j = JSON.stringify;
        const netSrcC = read('net.js'), hC = new Function('localStorage', 'crypto', netSrcC.slice(netSrcC.indexOf('// [netcheck:helpers-start]'), netSrcC.indexOf('// [netcheck:helpers-end]')) + '\nreturn { safeAvatar, cleanFace, faceView, charFacePlan, FACE_PICS };')({ getItem: () => null, setItem() {} }, globalThis.crypto);
        const shS = read('sheets.js'), tcA = shS.indexOf('function tokensOfChar('), tcB = shS.indexOf('\n', tcA);
        const mkC = (o) => {
            o = o || {};
            const tokA = Object.assign({ id: 't1', isChar: true, charId: 'c_1', type: 'circle', color: '#112233' }, o.tok || {}), other = { id: 't2', isChar: true, charId: 'c_2', type: 'circle' };
            const camp = { id: 'k', chars: { c_1: Object.assign({ id: 'c_1', name: 'Ana', ownerId: 'u_a', portrait: '' }, o.char || {}) }, items: { m1: { id: 'm1', type: 'map', whiteboard: [tokA, other] } } };
            const out = { after: 0, sent: [], toasts: [], uploads: [], flush: 0, remoteAtSave: null, prunes: [] };
            const netF = { active: true, role: 'host', applyingRemote: false, roster: { pA: { id: 'u_a', color: '#445566' } }, cleanFace: hC.cleanFace, safeAvatar: hC.safeAvatar, FACE_PICS: hC.FACE_PICS, broadcastItemFiltered: (c, m) => out.sent.push(m) };
            const api = new Function('getActiveCampaign', 'charById', 'net', 'afterCharChange', 'toast', 'window', 'pngOf', 'copyBundled', 'uploadExact', 'prunePics', shS.slice(tcA, tcB) + '\n' + slice('sheets.js', 'charface') + '\nreturn applyCharFace;')(
                () => camp, (id, cp) => (cp || camp).chars[id] || null, () => netF, () => { out.after++; out.remoteAtSave = netF.applyingRemote; }, t => out.toasts.push(t),
                { wpHistFlush: () => { out.flush++; } },
                () => Promise.resolve('PNG'), name => Promise.resolve({ portrait: '/saves/images/tutorial/' + name + '_sq.jpg', token: '/saves/images/tutorial/' + name + '_hex.png' }),
                (rel) => { out.uploads.push(rel); return Promise.resolve(o.url || '/saves/' + rel); }, (p, k) => { out.prunes.push([p, k]); return Promise.resolve(0); });
            return { api, camp, tok: tokA, other, out, netF };
        };
        const A = mkC(), B = mkC(), C = mkC(), D = mkC({ char: { portrait: '/saves/images/x.png' } }), E = mkC({ tok: { type: 'image', src: '/saves/images/art.png', color: 'transparent' } }), F = mkC({ url: 'https://evil.example/x.png' }), G = mkC(), H2 = mkC();
        const rA = await A.api('c_1', { kind: 'face', face: '\u{1F409}' }, false), rB = await B.api('c_1', { kind: 'bundled', name: 'orc' }, false), rC = await C.api('c_1', { kind: 'picture', data: 'data:image/png;base64,AAAA' }, false);
        const rD = await D.api('c_1', { kind: 'face', face: '\u{1F409}' }, false), rE = await E.api('c_1', { kind: 'face', face: '\u{1F409}' }, true), rF = await F.api('c_1', { kind: 'picture', data: 'data:image/png;base64,AAAA' }, false);
        const rG = await G.api('c_1', { kind: 'bundled', name: '../../etc' }, false), rH = await H2.api('c_1', { kind: 'face', face: '<img src=x>' }, false);
        check('F1c applyCharFace (run for real): an emoji face is drawn on the character\'s own tokens (none else) and its portrait stays bare; a bundled picture and a saved photo become its portrait and its tokens\' art; a give never overwrites a picture it has (its portrait or a token\'s art), an owner\'s change does (back to a circle in their colour); a saved address that is not the app\'s own, a bundled name off the list or a refused face changes nothing',
            rA === true && A.tok.face === '\u{1F409}' && !('face' in A.other) && A.camp.chars.c_1.portrait === '' && A.out.after === 1 && j(A.out.sent) === j(['m1'])
            && rB === true && B.camp.chars.c_1.portrait === '/saves/images/tutorial/orc_sq.jpg' && B.tok.type === 'image' && B.tok.src === '/saves/images/tutorial/orc_hex.png'
            && rC === true && /^\/saves\/images\/portraits\/portrait-c_1-[a-z0-9]{4,12}\.png$/.test(C.camp.chars.c_1.portrait) && C.tok.src === C.camp.chars.c_1.portrait && j(C.out.uploads) === j([C.camp.chars.c_1.portrait.slice(7)])
            && j(C.out.prunes) === j([['portrait-c_1', [C.camp.chars.c_1.portrait, '']]]) && A.out.prunes.length === 0 && B.out.prunes.length === 0 && F.out.prunes.length === 0 && D.out.prunes.length === 0
            && rD === false && D.camp.chars.c_1.portrait === '/saves/images/x.png' && !('face' in D.tok) && rE === true && E.tok.type === 'circle' && !('src' in E.tok) && E.tok.color === '#445566' && E.tok.face === '\u{1F409}'
            && rF === false && F.camp.chars.c_1.portrait === '' && !F.tok.src && rG === false && G.tok.type === 'circle' && rH === false && !('face' in H2.tok), JSON.stringify([rA, A.tok, rB, B.tok, rC, C.camp.chars.c_1.portrait, rD, rE, E.tok, rF, rG, rH]));
        {   // Onboarding F1c review: applyCharFace keeps the face on the character, a give never overwrites a face, the picture names take turns, never the GM's undo step
            const I = mkC({ tok: { face: '\u{1F408}' } }), J = mkC({ char: { face: 'default' } }), K = mkC({ char: { portrait: '/saves/images/portraits/portrait-c_1-a.png' } }), L = mkC({ char: { face: '\u{1F409}' } }), M = mkC();
            const rI = await I.api('c_1', { kind: 'face', face: '\u{1F409}' }, false), rJ = await J.api('c_1', { kind: 'face', face: '\u{1F409}' }, false), rK = await K.api('c_1', { kind: 'picture', data: 'data:image/png;base64,AAAA' }, true), rL = await L.api('c_1', { kind: 'bundled', name: 'orc' }, true);
            const rM = await M.api('c_1', { kind: 'face', face: '\u{1F409}' }, false);
            const kFirst = K.camp.chars.c_1.portrait, nowK = Date.now; let rK2;   // a second picture a moment later: another fresh name (a constant one would pass the pattern)
            try { Date.now = () => nowK() + 5000; rK2 = await K.api('c_1', { kind: 'picture', data: 'data:image/png;base64,AAAA' }, true); } finally { Date.now = nowK; }
            const kSecond = K.camp.chars.c_1.portrait;
            check('F1c applyCharFace keeps the face on the character (a token made later wears it; a picture clears it); a give never overwrites a face it has (its own or a token\'s); a new picture takes a fresh file name every time (a player\'s machine keeps a picture per address for the session); the change is never a step of the GM\'s undo (their pending edit is recorded first)',
                rI === false && I.tok.face === '\u{1F408}' && rJ === false && J.camp.chars.c_1.face === 'default' && !('face' in J.tok) && rK === true && /^\/saves\/images\/portraits\/portrait-c_1-[a-z0-9]{4,12}\.png$/.test(kFirst) && kFirst !== '/saves/images/portraits/portrait-c_1-a.png' && rK2 === true && /^\/saves\/images\/portraits\/portrait-c_1-[a-z0-9]{4,12}\.png$/.test(kSecond) && kSecond !== kFirst && j(K.out.uploads) === j([kFirst.slice(7), kSecond.slice(7)])
                && j(K.out.prunes) === j([['portrait-c_1', [kFirst, '/saves/images/portraits/portrait-c_1-a.png']], ['portrait-c_1', [kSecond, kFirst]]])
                && rL === true && !('face' in L.camp.chars.c_1) && rM === true && M.camp.chars.c_1.face === '\u{1F409}' && M.out.flush === 1 && M.out.remoteAtSave === true && M.netF.applyingRemote === false && K.out.remoteAtSave === true && K.netF.applyingRemote === false,
                j([rI, rJ, rK, rK2, K.out.uploads, K.out.prunes, rL, L.camp.chars.c_1, rM, M.out]));
        }
        {   // pngOf: a square of at most 256 pixels from the middle; past 4096 a side, refused before it is drawn
            const png = async (w, h) => { const calls = [];
                class Img { set src(v) { setTimeout(() => this.onload && this.onload(), 0); } get naturalWidth() { return w; } get naturalHeight() { return h; } }
                const doc = { createElement: () => { const cv = { width: 0, height: 0, getContext: () => ({ drawImage: (...a) => calls.push(a.slice(1)) }), toBlob: cb => cb({ w: cv.width, h: cv.height }) }; return cv; } };
                const fn = new Function('Image', 'document', slice('sheets.js', 'charpng') + '\nreturn pngOf;')(Img, doc);
                try { return { b: await fn('data:image/png;base64,AAAA'), calls }; } catch (e) { return { err: e.message, calls }; } };
            const pBig = await png(8192, 8192), pTall = await png(100, 5000), pWide = await png(1000, 500), pSmall = await png(50, 80), pZero = await png(0, 0);
            check('F1c a player\'s picture is saved as a square of at most 256 pixels cropped from its middle; one larger than 4096 on a side (or empty) is refused before it is drawn',
                pBig.err === 'size' && pBig.calls.length === 0 && pTall.err === 'size' && pZero.err === 'size' && j(pWide.b) === j({ w: 256, h: 256 }) && j(pWide.calls[0]) === j([250, 0, 500, 500, 0, 0, 256, 256]) && j(pSmall.b) === j({ w: 50, h: 50 }) && j(pSmall.calls[0]) === j([0, 15, 50, 50, 0, 0, 50, 50]),
                j([pBig, pTall, pWide, pSmall, pZero]));
        }
        {   // the owner's Picture button
            const pcA = shS.indexOf('function pickCharPicture('), pcB = shS.indexOf('\n}\n', pcA) + 2, av2 = 'data:image/png;base64,QUJD';
            const pickRun = (face, img, avatar, isOpen) => { const sent = []; let opened = null, closed = 0;
                const wf = { isOpen: () => !!isOpen, close: () => { closed++; }, open: (a, cur, prof, cb, o) => { opened = o; cb(face, img); } };
                const n = { charPic: (id, f, i) => { sent.push([id, f, i]); return { ok: true }; }, getProfile: () => ({ avatar }), safeAvatar: hC.safeAvatar };
                new Function('sheetOpen', 'charById', 'net', 'isClient', 'myId', 'toast', 'window', shS.slice(pcA, pcB) + '\nreturn pickCharPicture;')('c_1', () => ({ id: 'c_1', ownerId: 'u_a' }), () => n, () => true, () => 'u_a', () => {}, { wpFaces: wf })({});
                return { sent, opened, closed }; };
            const kPhoto = pickRun('photo', '', av2), kBad = pickRun('photo', '', 'data:image/svg+xml;base64,AA'), kEmoji = pickRun('\u{1F409}', '', av2), kUp = pickRun('', av2, ''), kOpen = pickRun('photo', '', av2, true);
            check('F1c the owner\'s Picture button: "My picture" sends the picture they see (their own, when it passes whole), anything else as picked; a second click closes the picker',
                pcA > 0 && j(kPhoto.sent) === j([['c_1', 'photo', av2]]) && j(kBad.sent) === j([['c_1', 'photo', '']]) && j(kEmoji.sent) === j([['c_1', '\u{1F409}', '']]) && j(kUp.sent) === j([['c_1', '', av2]]) && kPhoto.opened && kPhoto.opened.upload === true && kOpen.closed === 1 && kOpen.sent.length === 0 && kOpen.opened === null,
                j([kPhoto, kBad, kEmoji, kUp, kOpen]));
        }
        {   // the party strip: a character's own face
            const pf = list => { new Function('list', 'window', 'cssColor', slice('whiteboard.js', 'partyface'))(list, { wpNet: { cleanFace: hC.cleanFace, faceView: (p, c) => hC.faceView(p, c, cc => 'DEFAULT(' + cc + ')') } }, SC.cssColor); return list; };
            const pl = pf([{ key: 'o:u_a', face: '\u{1F409}', src: null, tcolor: '#112233' }, { key: 'o:u_b', face: 'default', src: null, tcolor: 'red;x:url(//evil)' }, { key: 'o:u_c', face: 'pic:orc', src: null }, { key: 'o:u_d', face: '<img src=x>', src: null }, { key: 'o:u_e', face: '\u{1F409}', src: '/saves/images/a.png' }, { key: 'o:u_f', face: null, src: null }]);
            check('F1c the party strip shows a character\'s own face: an emoji as text, a bundled picture or the default (its colour through cssColor) as a picture; a face the rule refuses, a token with art or no face is left as it was',
                pl[0].emoji === '\u{1F409}' && !pl[0].src && /^DEFAULT\(/.test(pl[1].src) && !/evil|url\(/.test(pl[1].src) && pl[1].avatar === true && pl[2].src === 'assets/tutorial/orc_sq.jpg' && !pl[3].src && !pl[3].emoji && pl[4].src === '/saves/images/a.png' && !pl[4].emoji && !pl[5].src && !pl[5].emoji
                && /if \(c\.emoji\) return '<span class="' \+ cls \+ ' party-face party-emoji" data-key="' \+ esc\(c\.key\) \+ '" data-tip="' \+ esc\(tip\) \+ '">' \+ esc\(c\.emoji\) \+ '<\/span>';/.test(read('whiteboard.js')), j(pl));
        }
        {   // characterList carries a token's own face and colour (the party strip draws from it); the GM's own portrait pick clears a face; the picker's own button toggles it
            const mdS = read('models.js'), clA = mdS.indexOf('export function characterList('), clB = mdS.indexOf('\n}\n', clA) + 2;
            const cl = new Function(mdS.slice(clA + 'export '.length, clB) + '\nreturn characterList;')();
            const campL = { items: { m1: { id: 'm1', type: 'map', meta: { title: 'M' }, whiteboard: [{ id: 't1', isChar: true, ownerId: 'u_a', charId: 'c_1', charName: 'Ana', type: 'circle', color: '#112233', face: '\u{1F409}', x: 0, y: 0, w: 60, h: 52 },
                { id: 't2', isChar: true, ownerId: 'u_b', charName: 'Bo', type: 'image', src: '/saves/images/a.png', color: 'transparent', face: '\u{1F409}', x: 0, y: 0, w: 60, h: 52 }, { id: 't3', isChar: true, ownerId: 'u_c', charName: 'Cy', type: 'circle', color: '#445566', x: 0, y: 0, w: 60, h: 52 }] } } };
            const lst = cl(campL, true, 'm1'), fcS = read('faces.js');
            check('F1c the party list carries a token\'s own face (none under art) and its colour; the GM\'s own portrait pick clears a character\'s face; the picker\'s own button closes it (a click there is not an outside click)',
                clA > 0 && j(lst.map(e => [e.name, e.face, e.tcolor])) === j([['Ana', '\u{1F409}', '#112233'], ['Bo', null, 'transparent'], ['Cy', null, '#445566']])
                && /\{ ch\.portrait = src; delete ch\.face; afterCharChange\(ch, true\); renderAll\(\); \}/.test(shS)
                && /window\.wpFaces = \{ open: open, close: close, isOpen: function\(\) \{ return !!pop; \},/.test(fcS)
                && /function outside\(e\) \{ if \(pop && !pop\.contains\(e\.target\) && [^\n]*!\(pop\._anchor && pop\._anchor\.contains && pop\._anchor\.contains\(e\.target\)\)\) close\(\); \}/.test(fcS), j(lst));
        }
        const mkEl = () => { const kids = []; return { dataset: {}, kids, set textContent(v) { kids.length = 0; }, appendChild(k) { kids.push(k); }, querySelector: sel => { const m = /(span|img)\.([\w-]+)$/.exec(sel); return m ? kids.find(k => k.tag === m[1] && String(k.className).split(' ').indexOf(m[2]) >= 0) || null : null; } }; };
        const docF = { createElement: (t) => { const o2 = { tag: t, attrs: {}, className: '' }; Object.defineProperty(o2, 'src', { set(v) { o2.attrs.src = String(v); }, get() { return o2.attrs.src; } }); o2.getAttribute = k => o2.attrs[k] === undefined ? null : o2.attrs[k]; return o2; } };
        const drawFace = (el, face, color) => { new Function('item', 'el', 'window', 'document', 'cssColor', slice('whiteboard.js', 'charface-tok') + '\nreturn cfv;')({ isChar: true, charName: 'Ana', face, color }, el, { wpNet: { cleanFace: hC.cleanFace, faceView: (p, c) => hC.faceView(p, c, cc => 'DEFAULT(' + cc + ')') } }, docF, SC.cssColor); return el.kids.map(k => k.tag + ':' + (k.textContent || k.attrs.src || '')); };
        const tokFace = face => drawFace(mkEl(), face, 'red;background:url(//evil)');
        const fe = tokFace('\u{1F409}'), fd = tokFace('default'), fb = tokFace('<img src=x onerror=alert(1)>');
        const elR = mkEl(); drawFace(elR, '\u{1F409}', '#112233'); elR.textContent = ''; const reb = drawFace(elR, '\u{1F409}', '#112233');   // the token was emptied (rebuilt) while its mark stayed
        const elC = mkEl(), c1 = drawFace(elC, 'default', '#112233'), c2 = drawFace(elC, 'default', '#445566'), sw = drawFace(elC, '\u{1F409}', '#445566'), back = drawFace(elC, 'default', '#445566');
        check('F1c a character token\'s face is drawn again whenever it is missing (a rebuilt token) or changed: a new colour of the default, an emoji for a picture and back',
            j(reb) === j(['span:\u{1F409}']) && j(c1) === j(['img:DEFAULT(#112233)']) && j(c2) === j(['img:DEFAULT(#445566)']) && j(sw) === j(['span:\u{1F409}']) && j(back) === j(['img:DEFAULT(#445566)']), j([reb, c1, c2, sw, back]));
        const wbC = read('whiteboard.js');
        check('F1c a character token\'s face: an emoji is text in a span; the default is the silhouette with its colour through cssColor; a face the rule refuses draws nothing of it (initials stay); the hover card reads the character\'s own face, never its owner\'s live picture',
            j(fe) === j(['span:\u{1F409}']) && fd.length === 1 && /^img:DEFAULT\(/.test(fd[0]) && !/url\(|evil/.test(fd[0]) && fb.length === 0
            && /var ownerAv = \(!wItem\.src && wItem\.face && window\.wpNet && window\.wpNet\.faceView\)/.test(wbC) && !/return x && x\.id === wItem\.ownerId; \}\); return p && window\.wpNet\.safeAvatar/.test(wbC) && !/ownerAvLive/.test(wbC), JSON.stringify([fe, fd, fb]));
    }
    {   // Onboarding F3a: the GM's review bar on a character a player made — every word through textContent (a player's name from the table, the clash labels), buttons of its own
        const j = JSON.stringify, SCr = await import(modUrl('systemcore.js')), rbSrc = slice('sheets.js', 'reviewbar');
        const node = (tag, cls, text) => { const o = { tag, className: cls || '', kids: [], style: {}, on: {}, appendChild(k) { this.kids.push(k); }, addEventListener(k, f) { this.on[k] = f; } }; let t = text === undefined ? '' : String(text); Object.defineProperty(o, 'textContent', { get() { return t; }, set(v) { t = String(v); o.kids.length = 0; } }); return o; };
        const called = [];
        const draw = (c, gm, names) => { const bar = node('div'); bar.style.display = 'none'; new Function('ui', 'el', 'playerNames', 'window', 'keepMade', 'sendBackMade', 'removeMadeAsk', rbSrc + '\nreturn renderReviewBar;')(id => id === 'sheetReviewBar' ? bar : null, node, () => names || {}, { wpSystemCore: SCr }, id => called.push(['keep', id]), id => called.push(['back', id]), id => called.push(['remove', id]))(c, { chars: { c_m: c, c_x: { id: 'c_x', name: c.name } }, items: {} }, gm); return bar; };
        const evil = '<img src=x onerror=alert(1)>', bM = draw({ id: 'c_m', name: 'Vex', ownerId: 'u_a', review: 1, made: 1 }, true, { u_a: evil }), bF = draw({ id: 'c_m', name: 'Vex', ownerId: 'u_a', review: 1 }, true, {}), bP = draw({ id: 'c_m', name: 'Vex', ownerId: 'u_a', review: 1, made: 1 }, false, {}), bN = draw({ id: 'c_m', name: 'Vex', ownerId: 'u_a' }, true, {});
        const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k), noHtml = b => !has(b, 'innerHTML') && b.kids.every(k => !has(k, 'innerHTML') && !has(k, 'outerHTML'));
        bM.kids.forEach(k => { if (k.on.click) k.on.click(); });
        check('F3a the GM\'s review bar (renderReviewBar, run for real): a player\'s name from the table and the name clash are text in a span, never markup; Keep it, Send back… and Remove… (Remove only on one a player made) call their own actions with the character\'s id; nothing for a player, or a character not waiting for review; no innerHTML anywhere',
            bM.style.display === '' && bM.kids[0].tag === 'span' && bM.kids[0].textContent === evil + ' made this character \u00b7 the name is also another character\u2019s.' && j(bM.kids.slice(1).map(k => [k.tag, k.textContent, k.type])) === j([['button', 'Keep it', 'button'], ['button', 'Send back\u2026', 'button'], ['button', 'Remove\u2026', 'button']])
            && j(called) === j([['keep', 'c_m'], ['back', 'c_m'], ['remove', 'c_m']]) && bF.kids[0].textContent === 'A player finished this sheet \u00b7 the name is also another character\u2019s.' && bF.kids.length === 3 && bP.style.display === 'none' && bP.kids.length === 0 && bN.style.display === 'none'
            && [bM, bF, bP, bN].every(noHtml) && !/innerHTML/.test(rbSrc), j([bM.kids.map(k => k.textContent), bF.kids.map(k => k.textContent)]));
    }
    {   // Grid-shaped tokens (2026-09-27): the hexagon plate — its colour through cssColor, SVG built with createElementNS (no markup), a waiting ring
        const j = JSON.stringify, hpSrc = slice('whiteboard.js', 'hexplate');
        const mkEl = () => { const kids = [], cls = new Set(); const el = { kids, cls, classList: { toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); } }, get firstChild() { return kids[0] || null; }, querySelector: sel => { const m = /svg\.(tok-plate|tok-ring)$/.exec(sel); return m ? kids.find(k => k.cls === m[1]) || null : null; }, insertBefore(n, ref) { const i = ref ? kids.indexOf(ref) : -1; kids.splice(i < 0 ? kids.length : i, 0, n); n.parent = el; }, appendChild(n) { kids.push(n); n.parent = el; } }; return el; };
        const doc = { createElementNS: (ns, tag) => { const n = { ns, tag, attrs: {}, kids: [], style: {}, setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.cls = String(v); }, appendChild(k) { this.kids.push(k); }, get firstChild() { return this.kids[0] || null; }, remove() { const p = this.parent; if (p) { const i = p.kids.indexOf(this); if (i >= 0) p.kids.splice(i, 1); } } }; return n; } };
        const draw = (item, el, hide) => { el = el || mkEl(); new Function('item', 'el', 'hideFromMe', 'cssColor', 'document', hpSrc)(item, el, !!hide, SC.cssColor, doc); return el; };
        const withFace = cls => { const e = mkEl(); e.kids.push({ cls }); return e; };
        const eW = draw({ type: 'hexagon', waiting: 1, color: '#112233' }, withFace('wait-emoji')), eC = draw({ type: 'hexagon', isChar: true, color: 'red;background:url(//evil)' }, withFace('token-initials')), eBack = draw({ type: 'hexagon', isChar: true, color: '#112233' }, draw({ type: 'hexagon', waiting: 1, color: '#112233' }));
        const eOff = draw({ type: 'circle', isChar: true, color: '#112233' }, draw({ type: 'hexagon', waiting: 1, color: '#112233' })), eHide = draw({ type: 'hexagon', waiting: 1, color: '#112233' }, undefined, true), ePlain = draw({ type: 'hexagon', color: '#112233' });
        const polyOf = sv => sv && sv.kids[0];
        check('grid shape: a hexagon token (a character\'s or a waiting one) gets a plate inside its box — an SVG made with createElementNS, its fill the item colour through cssColor (a colour the rule refuses leaves the plate\'s own), first under the face; a waiting one a ring on top; a character\'s none; a token that stops being a hexagon, a hidden stub or a hexagon that is no token: neither, and no class',
            eW.cls.has('wb-hextok') && j(eW.kids.map(k => k.cls)) === j(['tok-plate', 'wait-emoji', 'tok-ring']) && polyOf(eW.kids[0]).style.fill === '#112233' && eW.kids[0].ns === 'http://www.w3.org/2000/svg' && polyOf(eW.kids[0]).attrs.points === '15,1 45,1 59,26 45,51 15,51 1,26'
            && j(eC.kids.map(k => k.cls)) === j(['tok-plate', 'token-initials']) && polyOf(eC.kids[0]).style.fill === '' && !/evil/.test(j(eC.kids[0].kids[0].style)) && eBack.kids.length === 1 && eBack.kids[0].cls === 'tok-plate'
            && eOff.kids.length === 0 && !eOff.cls.has('wb-hextok') && eHide.kids.length === 0 && !eHide.cls.has('wb-hextok') && ePlain.kids.length === 0 && !/innerHTML/.test(hpSrc), j([eW.kids.map(k => k.cls), eC.kids.map(k => k.cls), eOff.kids.length]));
        // applyCharFace with the grid (sheets.js, run for real with the real systemcore): a picture is cut to its map's cell, a face's token takes the cell
        const SCc = await import(modUrl('systemcore.js')), netSrcG = read('net.js'), hG = new Function('localStorage', 'crypto', netSrcG.slice(netSrcG.indexOf('// [netcheck:helpers-start]'), netSrcG.indexOf('// [netcheck:helpers-end]')) + '\nreturn { safeAvatar, cleanFace, FACE_PICS };')({ getItem: () => null, setItem() {} }, globalThis.crypto);
        const shG = read('sheets.js'), tcA = shG.indexOf('function tokensOfChar('), tcB = shG.indexOf('\n', tcA);
        const faceRun = async (grid, tok, plan, replace) => {
            const tokA = Object.assign({ id: 't1', isChar: true, charId: 'c_1', type: 'circle', color: '#112233', x: 100, y: 200, w: 60, h: 52 }, tok || {});
            const camp = { id: 'k', chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', portrait: '' } }, items: { m1: { id: 'm1', type: 'map', meta: grid ? { gridType: grid } : {}, whiteboard: [tokA] } } };
            const netF = { active: true, role: 'host', applyingRemote: false, roster: { pA: { id: 'u_a', color: '#445566' } }, cleanFace: hG.cleanFace, safeAvatar: hG.safeAvatar, FACE_PICS: hG.FACE_PICS, broadcastItemFiltered() {} };
            const api = new Function('getActiveCampaign', 'charById', 'net', 'afterCharChange', 'toast', 'window', 'pngOf', 'copyBundled', 'uploadExact', 'prunePics', shG.slice(tcA, tcB) + '\n' + slice('sheets.js', 'charface') + '\nreturn applyCharFace;')(
                () => camp, (id, cp) => (cp || camp).chars[id] || null, () => netF, () => {}, () => {}, { wpHistFlush() {}, wpSystemCore: SCc }, () => Promise.resolve('PNG'), name => Promise.resolve({ portrait: '/saves/images/tutorial/' + name + '_sq.jpg', token: '/saves/images/tutorial/' + name + '_sq.jpg' }), rel => Promise.resolve('/saves/' + rel), () => Promise.resolve(0));
            await api('c_1', plan, !!replace); return tokA;
        };
        const fBH = await faceRun('hex', null, { kind: 'bundled', name: 'orc' }), fBS = await faceRun('square', null, { kind: 'bundled', name: 'orc' }), fBO = await faceRun(null, null, { kind: 'bundled', name: 'orc' });
        const fEH = await faceRun('hex', { type: 'image', src: '/saves/images/art.png', shape: 'hexagon', color: 'transparent' }, { kind: 'face', face: '\u{1F409}' }, true), fES = await faceRun('square', null, { kind: 'face', face: '\u{1F409}' });
        check('grid shape: a character\'s picture on its tokens is cut to each map\'s cell (hex: a hexagon 60x52, square: a square 50x50, no grid: round, its size kept) — the bundled square picture everywhere; back to a face, a token takes the cell\'s plain shape (its old outline gone)',
            fBH.type === 'image' && fBH.src === '/saves/images/tutorial/orc_sq.jpg' && fBH.x === 100 && fBH.y === 200 && fBS.x === 105 && fBS.y === 201 && fBH.shape === 'hexagon' && fBH.w === 60 && fBS.shape === 'rect' && fBS.w === 50 && fBS.h === 50 && fBO.shape === 'circle' && fBO.w === 60
            && fEH.type === 'hexagon' && !('shape' in fEH) && !('src' in fEH) && fEH.face === '\u{1F409}' && fES.type === 'rect' && fES.w === 50 && fES.face === '\u{1F409}', j([fBH, fBS, fBO, fEH, fES]));
        // applyTokenFace with the grid (sheets.js, run for real): a Just a token picture is cut to its map's cell once it is saved, and seated
        const tfA = shG.indexOf('function applyTokenFace('), tfB = shG.indexOf('\nfunction keepMade(');
        const tokFaceRun = async (grid, plan) => {
            const w = { id: 'w1', isChar: true, type: 'circle', color: '#112233', x: 100, y: 200, w: 60, h: 52 }, seats = [], prunes = [];
            const camp = { id: 'k', items: { m1: { id: 'm1', type: 'map', meta: grid ? { gridType: grid } : {}, whiteboard: [w] } } };
            const netF = { active: true, role: 'host', applyingRemote: false, safeAvatar: hG.safeAvatar, FACE_PICS: hG.FACE_PICS, broadcastItemFiltered() {} };
            const api = new Function('getActiveCampaign', 'net', 'isClient', 'save', 'toast', 'window', 'pngOf', 'copyBundled', 'uploadExact', 'prunePics', shG.slice(tfA, tfB) + '\nreturn applyTokenFace;')(
                () => camp, () => netF, () => false, () => {}, () => {}, { wpHistFlush() {}, wpSystemCore: SCc, wpSeatCell: (it, m) => { seats.push(m.id); return false; } }, () => Promise.resolve('PNG'), name => Promise.resolve({ portrait: '/saves/images/tutorial/' + name + '_sq.jpg', token: '/saves/images/tutorial/' + name + '_sq.jpg' }), rel => Promise.resolve('/saves/' + rel), (p, k) => { prunes.push([p, k]); return Promise.resolve(0); });
            const r = await api('m1', 'w1', plan); return { r, w, seats, prunes };
        };
        const tfH = await tokFaceRun('hex', { kind: 'bundled', name: 'orc' }), tfS = await tokFaceRun('square', { kind: 'picture', data: 'data:image/png;base64,iVBORw0KGgo=' }), tfO = await tokFaceRun(null, { kind: 'bundled', name: 'orc' });
        check('grid shape: Just a token\'s picture (applyTokenFace, run for real) is cut to its map\'s cell once saved and seated there — hex: a hexagon 60x52, a square grid: a square 50x50 (the photo saved as token-<id>-<fresh>.png), no grid: round at its size',
            tfA > 0 && tfB > tfA && tfH.r === true && tfH.w.type === 'image' && tfH.w.src === '/saves/images/tutorial/orc_sq.jpg' && tfH.w.shape === 'hexagon' && tfH.w.w === 60 && tfS.r === true && tfS.w.shape === 'rect' && tfS.w.w === 50 && /^\/saves\/images\/portraits\/token-w1-[a-z0-9]{4,12}\.png$/.test(tfS.w.src) && j(tfS.seats) === j(['m1']) && j(tfS.prunes) === j([['token-w1', [tfS.w.src, '']]]) && tfH.prunes.length === 0
            && tfO.w.shape === 'circle' && tfO.w.w === 60 && tfH.seats.length === 1, j([tfH, tfS, tfO]));
        // The token creator's review: a character's and a token's pictures kept few (sheets.js prunePics, run for real)
        const prS = slice('sheets.js', 'prunepics');
        const prRun = async (o) => {
            const del = [], asked = [];
            const fetchS = (u, opt) => { asked.push(u); if (o.fail) return Promise.reject(new Error('net')); if (u === '/api/list-images') return Promise.resolve({ ok: true, json: () => Promise.resolve(o.list) }); del.push(JSON.parse(opt.body).path); return Promise.resolve({ ok: o.delOk !== false }); };
            const fn = new Function('isClient', 'fetch', 'state', 'window', prS + '\nreturn prunePics;')(() => !!o.client, fetchS, { appState: o.app || { campaigns: {} } }, { wpHist: o.noHist ? undefined : { refs: nm => (o.hist || []).indexOf(nm) >= 0 } });
            const n = await fn(o.prefix || 'portrait-c_1', o.keep || []); return { n, del, asked };
        };
        const PP = nm => '/saves/images/portraits/' + nm, im = (nm, t) => ({ path: PP(nm), mtime: t });
        const L1 = [im('portrait-c_1-k4.png', 50), im('portrait-c_1-k3.png', 40), im('portrait-c_1-k2.png', 30), im('portrait-c_1-k1.png', 20), im('portrait-c_1-a.png', 10), im('portrait-c_1-k0.png', 5),
            im('portrait-c_12-z1.png', 1), im('portrait-c_1-x.jpg', 1), { path: '/saves/images/other/portrait-c_1-k9.png', mtime: 1 }, im('portrait-c_1-K9.png', 1), im('portrait-c_1-k9.png.png', 1), im('portrait-c_1-b-c1.png', 1), null, { path: 5 }];
        const pr1 = await prRun({ list: L1, keep: [PP('portrait-c_1-k4.png'), PP('portrait-c_1-k3.png')], app: { campaigns: { other: { chars: { c_9: { portrait: PP('portrait-c_1-k1.png') } } } } }, hist: ['portrait-c_1-k2.png'] });
        const pr2 = await prRun({ list: [im('portrait-c_1-n4.png', 7), im('portrait-c_1-n1.png', 10), im('portrait-c_1-n3.png', 8), im('portrait-c_1-n2.png', 9)], keep: [PP('portrait-c_1-n3.png')] });
        const pr3 = await prRun({ client: true, list: L1 }), pr4 = await prRun({ prefix: 'portrait-../x', list: L1 }), pr4b = await prRun({ prefix: 'x-c_1', list: L1 }), pr4c = await prRun({ prefix: 5, list: L1 });
        const pr5 = await prRun({ prefix: 'token-w1', list: [im('token-w1-a1.png', 3), im('token-w1-a2.png', 2), im('token-w1-a3.png', 1), im('token-w1-b-c1.png', 0), im('token-w12-a4.png', 0)] });
        const pr6 = await prRun({ fail: true, list: L1 }), pr6b = await prRun({ list: { length: 3 } }), pr7 = await prRun({ noHist: true, list: L1 }), pr8 = await prRun({ delOk: false, list: [im('portrait-c_1-q1.png', 3), im('portrait-c_1-q2.png', 2), im('portrait-c_1-q3.png', 1)] });
        check('token creator review: a character\'s and a plain token\'s pictures are kept few (prunePics, run for real) — the two newest files (one may still be on its way onto the token), the one it wears and the one before it, and any a campaign or a step of the GM\'s undo still shows stay; the rest are deleted; never a file of another id, another folder, not a PNG or not a name the app makes; never on a player\'s machine, with a prefix that is not ours, or with no undo to ask; a failure resolves quietly',
            j(pr1.del) === j([PP('portrait-c_1-a.png'), PP('portrait-c_1-k0.png')]) && pr1.n === 2 && j(pr2.del) === j([PP('portrait-c_1-n4.png')])
            && pr3.asked.length === 0 && pr3.n === 0 && pr4.asked.length === 0 && pr4b.asked.length === 0 && pr4c.asked.length === 0 && j(pr5.del) === j([PP('token-w1-a3.png')])
            && pr6.n === 0 && pr6.del.length === 0 && pr6b.n === 0 && pr6b.del.length === 0 && pr7.del.length === 0 && pr8.n === 0 && j(pr8.del) === j([PP('portrait-c_1-q3.png')]), j([pr1, pr2, pr5, pr7, pr8]));
        const ioH = read('io.js').split(/\r?\n/).find(l => l.startsWith('window.wpHist = {')), winH = {};
        new Function('histories', 'window', ioH)({ a: { last: '{"src":"/saves/images/portraits/token-w1-q1.png"}', undo: ['x', '{"src":"/saves/images/portraits/token-w1-q2.png"}'], redo: [] }, b: { last: '', undo: [], redo: ['<img src=\"/saves/images/portraits/token-w1-q3.png\">'] } }, winH);
        const rf = winH.wpHist && winH.wpHist.refs;
        check('token creator review: the GM\'s undo says whether a step still shows a picture (io.js wpHist.refs, run for real) — the current state, an undo or a redo step of any item; nothing for a name none has, or no name',
            !!rf && rf('token-w1-q1.png') === true && rf('token-w1-q2.png') === true && rf('token-w1-q3.png') === true && rf('token-w1-q4.png') === false && rf('') === false && rf(null) === false && typeof winH.wpHist.peek === 'function');

        /* ---- the token creator, the GM's side (fold 2), run for real ---- */
        const jj = JSON.stringify, SCf = SCc, SAFE = await import(modUrl('safecore.js'));
        const wbF = read('whiteboard.js'), gfS = slice('whiteboard.js', 'gmframe'), tgA = wbF.indexOf('function tokenGuide('), tgB = wbF.indexOf('\n', wbF.indexOf('window.wpTokenGuide = tokenGuide;'));
        const tgWin = { wpSystemCore: SCf }, tokenGuideF = new Function('window', wbF.slice(tgA, tgB) + '\nreturn tokenGuide;')(tgWin);
        check('token creator (GM): the outline guide is published as window.wpTokenGuide (the roster portrait and the ShadowBase import frame against it)',
            tgWin.wpTokenGuide === tokenGuideF && jj(tgWin.wpTokenGuide({ isChar: true, type: 'image', src: 'x', w: 60, h: 52 }, { meta: { gridType: 'hex' } })) === jj({ shape: 'hexagon', w: 60, h: 52 }));
        const mkGm = (o) => {
            o = o || {}; const out = { opened: [], toasts: [], calls: [] };
            const win = { wpSystemCore: SCf, wpFrame: o.noFrame ? undefined : { open(src, opts, cb) { out.opened.push({ src, opts }); if (o.errFirst && out.opened.length === 1) { if (typeof opts.onError === 'function') opts.onError(); return true; } if (o.answer) cb(o.answer); return true; } },
                wpSheets: o.noAppliers ? {} : { applyCharFrame(cid, plan) { out.calls.push(['char', cid, plan]); return Promise.resolve(true); }, applyTokenFrame(mid, ids, plan) { out.calls.push(['tok', mid, ids, plan]); return Promise.resolve(o.tokOk !== false); } } };
            if (!o.noPersistHook) win.wpCanPersistLocal = () => o.away !== true;
            const api = new Function('window', 'picRef', 'getActiveCampaign', 'toast', 'tokenGuide', gfS + '\nreturn { frameSourceOf, frameGmPicture };')(win, SAFE.picRef, () => o.camp, t => out.toasts.push(t), tokenGuideF);
            return { api, out };
        };
        const fr0 = { src: '/saves/images/lib/big photo.png', x: 10, y: 20, s: 300, of: '/saves/images/portraits/token-w1-k1.png' };
        const campG = { id: 'k', chars: { c_1: { id: 'c_1', name: 'Ana', portrait: '/saves/images/portraits/portrait-c_1-p1.png', frame: { src: '/saves/images/lib/ana.png', x: 1, y: 2, s: 200, of: '/saves/images/portraits/portrait-c_1-p1.png' } }, c_2: { id: 'c_2', name: 'Bo', portrait: fr0.of } } };
        const G0 = mkGm({ camp: campG }).api, fs = t => G0.frameSourceOf(t, campG), kept0 = { src: fr0.src, start: { x: 10, y: 20, s: 300 } };
        const src1 = fs({ type: 'image', src: '/saves/images/lib/x.png' }), src2 = fs({ type: 'image', src: fr0.of, frame: fr0 }), src3 = fs({ type: 'image', src: '/saves/images/other.png', frame: fr0 });
        const src4 = fs({ type: 'image', src: fr0.of, frame: Object.assign({}, fr0, { src: 'https://evil.example/x.png' }) }), src5 = fs({ type: 'image', src: 'https://evil.example/t.png' }), src6 = fs({ type: 'image', src: '//evil.example/t.png' });
        const src7 = fs({ type: 'image', src: '/saves/images/portraits/portrait-c_1-p1.png', charId: 'c_1', frame: fr0 }), src8 = fs({ type: 'image', src: '/saves/images/tutorial/orc_hex.png' }), src9 = fs({ type: 'circle', src: '/saves/images/x.png' });
        const src10 = fs({ type: 'image', src: fr0.of, charId: '__proto__', frame: fr0 }), src11 = fs({ type: 'image', src: fr0.of, frame: Object.assign({}, fr0, { src: '/saves/images/../data.json' }) });
        const srcA = fs({ type: 'image', src: 'assets/tutorial/orc_hex.png' }), srcB = fs({ type: 'image', src: fr0.of, charId: 'c_2', frame: fr0 }), srcC = fs({ type: 'image', src: fr0.of, charId: 'c_1', frame: fr0 });
        check('token creator (GM): Frame picture… frames from the kept original while the token still wears what was framed from it — its character\'s while its tokens wear that, else the token\'s own (one framed before it had a character) — else the picture it wears (a bundled hexagon from its square twin); a kept original that is not a saved picture, and a picture that is not the app\'s own, are never opened; only a picture token; a charId that is a prototype key is no character',
            jj(src1) === jj({ src: '/saves/images/lib/x.png', start: null }) && jj(src2) === jj(kept0) && jj(src3) === jj({ src: '/saves/images/other.png', start: null })
            && jj(src4) === jj({ src: fr0.of, start: null }) && src5 === null && src6 === null && jj(src7) === jj({ src: '/saves/images/lib/ana.png', start: { x: 1, y: 2, s: 200 } })
            && jj(src8) === jj({ src: 'assets/tutorial/orc_sq.jpg', start: null }) && jj(srcA) === jj({ src: 'assets/tutorial/orc_sq.jpg', start: null }) && src9 === null && jj(src10) === jj(kept0) && jj(src11) === jj({ src: fr0.of, start: null })
            && jj(srcB) === jj(kept0) && jj(srcC) === jj(kept0), jj([src1, src2, src3, src4, src7, src8, src10, src11, srcA, srcB, srcC]));
        const hexM = { id: 'm1', type: 'map', meta: { gridType: 'hex' }, whiteboard: [{ id: 'w1', isChar: true, type: 'image', src: fr0.of, shape: 'hexagon', w: 60, h: 52, frame: fr0 }, { id: 'w2', isChar: true, type: 'image', src: '/saves/images/portraits/portrait-c_1-p1.png', charId: 'c_1', w: 60, h: 52, shape: 'hexagon' },
            { id: 'wp', isChar: true, type: 'image', src: '/saves/images/lib/x.png', charId: '__proto__' }, { id: 'wq', isChar: true, type: 'image', src: '/saves/images/lib/x.png', charId: 'c_9' }] };
        const ans = { blob: { size: 9 }, rect: { x: 5, y: 6, s: 70 }, w: 400, h: 300, keep: true }, ansNo = Object.assign({}, ans, { keep: false }), tick = () => new Promise(r => setTimeout(r, 0));
        const g1 = mkGm({ camp: campG, answer: ans }); g1.api.frameGmPicture(hexM, ['w1', 'w9']); await tick();
        const g2 = mkGm({ camp: campG, answer: ansNo }); g2.api.frameGmPicture(hexM, ['w2']); await tick();
        const g3 = mkGm({ camp: campG, away: true, answer: ans }); const r3 = g3.api.frameGmPicture(hexM, ['w1']);
        const g4 = mkGm({ camp: campG, answer: ans, tokOk: false }); g4.api.frameGmPicture(hexM, ['w1']); await tick();
        const g5 = mkGm({ camp: campG }); const r5 = g5.api.frameGmPicture({ id: 'm1', type: 'map', whiteboard: [{ id: 'w5', type: 'image', src: 'https://evil.example/x.png' }] }, ['w5']);
        const g6 = mkGm({ camp: campG, answer: ans, errFirst: true }); g6.api.frameGmPicture(hexM, ['w1']); await tick();
        const g7 = mkGm({ camp: campG, answer: ans, noFrame: true }), r7 = g7.api.frameGmPicture(hexM, ['w1']), g8 = mkGm({ camp: campG, answer: ans, noAppliers: true }), r8 = g8.api.frameGmPicture(hexM, ['w1']), g9 = mkGm({ camp: campG, answer: ans, noPersistHook: true }), r9 = g9.api.frameGmPicture(hexM, ['w1']);
        const g10 = mkGm({ camp: campG, answer: ans }), r10 = g10.api.frameGmPicture(hexM, ['wp']), g11 = mkGm({ camp: campG, answer: ans }), r11 = g11.api.frameGmPicture(hexM, ['wq']); await tick();
        const o1 = g1.out.opened[0] || {}, c1 = g1.out.calls[0] || [], c2 = g2.out.calls[0] || [], c6 = g6.out.calls[0] || [];
        check('token creator (GM, run for real): Frame picture… opens the creator on the source (256 px, a PNG blob, the token\'s outline, the kept square, Keep the original offered) and hands OK to the character (every token of it, scope tokens) or to the selected plain tokens, with what they wore and the kept original only when ticked; a kept original that is gone falls back to the picture it wears (from the middle, it the new original); never at someone else\'s table, without the creator or the appliers, on a picture that is not the app\'s own, or for a charId that is no character of this campaign; a failed save says so',
            o1.src === fr0.src && o1.opts.px === 256 && o1.opts.as === 'blob' && o1.opts.keep === true && jj(o1.opts.start) === jj({ x: 10, y: 20, s: 300 }) && jj(o1.opts.guide) === jj({ shape: 'hexagon', w: 60, h: 52 }) && typeof o1.opts.onError === 'function'
            && c1[0] === 'tok' && c1[1] === 'm1' && jj(c1[2]) === jj(['w1', 'w9']) && c1[3].was === fr0.of && c1[3].blob === ans.blob && jj(c1[3].frame) === jj({ src: fr0.src, x: 5, y: 6, s: 70 }) && jj(g1.out.toasts) === jj(['The picture is framed.'])
            && c2[0] === 'char' && c2[1] === 'c_1' && c2[2].scope === 'tokens' && c2[2].frame === null && c2[2].was === '/saves/images/portraits/portrait-c_1-p1.png' && g2.out.opened[0].src === '/saves/images/lib/ana.png'
            && g6.out.opened.length === 2 && g6.out.opened[1].src === fr0.of && g6.out.opened[1].opts.start === null && g6.out.opened[1].opts.onError === null && c6[0] === 'tok' && jj(c6[3].frame) === jj({ src: fr0.of, x: 5, y: 6, s: 70 }) && /kept original is gone/.test(g6.out.toasts[0])
            && r3 === false && g3.out.opened.length === 0 && g3.out.toasts.length === 1 && g4.out.toasts.length === 1 && /Nothing was framed/.test(g4.out.toasts[0]) && r5 === false && g5.out.opened.length === 0 && jj(g5.out.toasts) === jj(['That picture cannot be framed.'])
            && [[r7, g7], [r8, g8], [r9, g9]].every(([r, g]) => r === false && g.out.opened.length === 0 && g.out.calls.length === 0)
            && [[r10, g10], [r11, g11]].every(([r, g]) => r === false && g.out.opened.length === 0 && g.out.calls.length === 0 && jj(g.out.toasts) === jj(['That picture cannot be framed.'])), jj([o1, c1, c2, g6.out, g3.out, g4.out.toasts]));

        // applyCharFrame, run for real with the real charsOf / charById / tokensOfChar (own keys only)
        const shF = read('sheets.js'), lineAt = (src, k) => { const i = src.indexOf(k); return i < 0 ? '' : src.slice(i, src.indexOf('\n', i)); };
        const cLines = [lineAt(shF, 'function charsOf('), lineAt(shF, 'function charById('), lineAt(shF, 'function tokensOfChar(')].join('\n');
        const cfRun = async (o) => {
            o = o || {};
            const toks = [Object.assign({ id: 't1', isChar: true, charId: 'c_1', type: 'image', src: '/saves/images/old.png', w: 60, h: 52, x: 0, y: 0 }, o.t1 || {}), Object.assign({ id: 't2', isChar: true, charId: 'c_1', type: 'image', src: '/saves/images/art.png', w: 60, h: 52, x: 0, y: 0 }, o.t2 || {}), { id: 't3', isChar: true, charId: 'c_2', type: 'image', src: '/saves/images/old.png' }, { id: 't4', isChar: true, type: 'image', src: '/saves/images/old.png' }];
            const camp = { id: 'k', chars: { c_1: Object.assign({ id: 'c_1', name: 'Ana', portrait: '/saves/images/old.png', face: 'x' }, o.char || {}) }, items: { m1: { id: 'm1', type: 'map', meta: { gridType: 'hex' }, whiteboard: toks } } };
            let cur = camp;
            const out = { uploads: [], prunes: [], after: 0, remote: null, sent: [], toasts: [], flush: 0, barrier: null }, netF = { active: true, role: 'host', applyingRemote: false, broadcastItemFiltered: (c, m) => out.sent.push(m) };
            const api = new Function('getActiveCampaign', 'isClient', 'canWrite', 'uploadExact', 'window', 'net', 'afterCharChange', 'prunePics', 'toast', cLines + '\n' + slice('sheets.js', 'charframe') + '\nreturn applyCharFrame;')(
                () => cur, () => !!o.client, () => o.write !== false, (rel, b) => { out.uploads.push([rel, b]); if (o.during) o.during(camp); if (o.switchCamp) cur = { id: 'k2', chars: { c_1: camp.chars.c_1 }, items: {} }; return o.upFail ? Promise.reject(new Error('x')) : Promise.resolve('/saves/' + rel); },
                { wpSystemCore: SCf, wpHistFlush() { out.flush++; }, wpHistBarrier(ids) { out.barrier = ids.slice(); } }, () => netF, () => { out.after++; out.remote = netF.applyingRemote; }, (p, k) => { out.prunes.push([p, k]); }, t => out.toasts.push(t));
            const r = await api(o.cid || 'c_1', Object.assign({ blob: new Blob(['x']), scope: 'tokens', was: '/saves/images/old.png', frame: { src: '/saves/images/lib/big.png', x: 1, y: 2, s: 50 } }, o.plan || {}));
            return { r, camp, toks, out, netF };
        };
        const protoBefore = jj(Object.getOwnPropertyNames(Object.prototype).sort());
        const A1 = await cfRun(), A2 = await cfRun({ plan: { scope: 'portrait', frame: null }, char: { frame: { src: '/saves/images/lib/was.png', x: 0, y: 0, s: 9, of: '/saves/images/old.png' } } }), A3 = await cfRun({ char: { portrait: '/saves/images/face.png' } }), A4 = await cfRun({ plan: { was: '/saves/images/nobody.png' } });
        const A5 = await cfRun({ client: true }), A6 = await cfRun({ write: false }), A7 = await cfRun({ plan: { blob: 'data:image/png;base64,AAAA' } }), A8 = await cfRun({ plan: { scope: 'all' } }), A9 = await cfRun({ upFail: true }), A10 = await cfRun({ plan: { frame: { src: 'https://evil.example/x.png', x: 1, y: 2, s: 50 } } });
        const u1 = A1.camp.chars.c_1.portrait, u2 = A2.camp.chars.c_1.portrait;
        check('token creator (GM, applyCharFrame run for real): Frame picture… on a character\'s token gives every token of it the framed picture (a fresh portrait-<id> name; another character\'s untouched), its portrait too when it was that picture, and keeps the original only when asked (a web address never); Portrait… sets the portrait, and the tokens that wore the old one follow; a portrait of its own stays; never on a player\'s machine, at someone else\'s table, with anything but a picture file, an unknown scope or a token no longer wearing it; never a step of the GM\'s undo (their pending edit written first), and a barrier on the maps it changed; pruned',
            A1.r === true && /^\/saves\/images\/portraits\/portrait-c_1-[a-z0-9]{4,12}\.png$/.test(u1) && A1.toks[0].src === u1 && A1.toks[1].src === u1 && A1.toks[2].src === '/saves/images/old.png' && A1.toks[3].src === '/saves/images/old.png' && !('face' in A1.camp.chars.c_1)
            && jj(A1.camp.chars.c_1.frame) === jj({ src: '/saves/images/lib/big.png', x: 1, y: 2, s: 50, of: u1 }) && A1.out.remote === true && A1.netF.applyingRemote === false && jj(A1.out.sent) === jj(['m1']) && jj(A1.out.prunes) === jj([['portrait-c_1', [u1, '/saves/images/old.png', '/saves/images/old.png']]])
            && A1.out.flush === 1 && jj(A1.out.barrier) === jj(['m1']) && jj(A2.out.barrier) === jj(['m1'])
            && A2.r === true && A2.toks[0].src === u2 && A2.toks[1].src === '/saves/images/art.png' && !('frame' in A2.camp.chars.c_1)
            && A3.r === true && A3.camp.chars.c_1.portrait === '/saves/images/face.png' && A3.toks[0].src === A3.toks[1].src && A3.toks[0].src !== '/saves/images/old.png'
            && [A4, A5, A6, A7, A8].every(x => x.r === false && x.out.uploads.length === 0 && x.camp.chars.c_1.portrait === '/saves/images/old.png') && A9.r === false && A9.toks[0].src === '/saves/images/old.png' && A9.out.toasts.length === 1 && A10.r === true && !('frame' in A10.camp.chars.c_1),
            jj([A1.camp.chars.c_1, A1.toks, A2.toks, A3.toks, A1.out.prunes, A1.out.barrier]));
        const A11 = await cfRun({ char: { portrait: '' } }), A12 = await cfRun({ t2: { type: 'circle', face: 'x', color: '#f00', src: undefined } }), A13 = await cfRun({ plan: { scope: 'portrait', frame: null }, t2: { type: 'circle', src: '/saves/images/old.png' } });
        const A14 = await cfRun({ cid: 'c_9' }), A15 = await cfRun({ switchCamp: true }), A16 = await cfRun({ during: cp => { cp.items.m1.whiteboard.forEach(w => { if (w.charId === 'c_1') w.src = '/saves/images/pp.png'; }); cp.chars.c_1.portrait = '/saves/images/pp.png'; } });
        const keptA = { src: '/saves/images/lib/big.png', x: 1, y: 2, s: 50, of: '/saves/images/art.png' };
        const A17 = await cfRun({ plan: { scope: 'portrait' }, char: { portrait: '/saves/images/face.png', frame: keptA }, t1: { src: '/saves/images/art.png' } }), A18 = await cfRun({ plan: { scope: 'portrait', frame: null }, char: { portrait: '/saves/images/face.png', frame: keptA }, t1: { src: '/saves/images/art.png' } });
        const A19 = await cfRun({ plan: { scope: 'portrait' }, char: { portrait: '/saves/images/face.png' } }), A20 = await cfRun({ cid: '__proto__' }), A21 = await cfRun({ cid: 'constructor' });
        const A22 = await cfRun({ plan: { scope: 'portrait' }, char: { id: 'c_other' } }), A23 = await cfRun({ plan: { scope: 'portrait' }, switchCamp: true });
        const hlp = new Function('getActiveCampaign', cLines + '\nreturn { charById, tokensOfChar };')(() => null);
        const campH = { chars: { c_1: { id: 'c_1' } }, items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 'a', isChar: true, charId: 'c_1' }, { id: 'b', isChar: true }, { id: 'c', isChar: true, charId: '' }] } } };
        check('token creator (GM): a character is found by its own key only (never a prototype name), and a character with no id has no tokens (a token with no character is never one of its)',
            hlp.charById('c_1', campH) === campH.chars.c_1 && ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '', null, 5].every(k => hlp.charById(k, campH) === null)
            && jj(hlp.tokensOfChar(campH, 'c_1').map(t => t.w.id)) === jj(['a']) && hlp.tokensOfChar(campH, undefined).length === 0 && hlp.tokensOfChar(campH, '').length === 0 && hlp.tokensOfChar(campH, null).length === 0);
        check('token creator (GM, applyCharFrame run for real): a character stored under another key than its id, or a campaign switched while its portrait was saved, is never written (Portrait…, which has no token to recheck)',
            A22.r === false && A22.out.uploads.length === 0 && A22.camp.chars.c_1.portrait === '/saves/images/old.png' && A23.r === false && A23.camp.chars.c_1.portrait === '/saves/images/old.png' && A23.out.after === 0);
        const protoAfter = jj(Object.getOwnPropertyNames(Object.prototype).sort());
        check('token creator (GM, applyCharFrame run for real): a character with no portrait takes the framed one; its tokens become pictures (no face, no fill) cut to their map\'s cell; Portrait… moves only picture tokens that wore the old portrait; refused and nothing written: an unknown character, a campaign switched or a token changed while the picture was saved; a kept original its tokens still wear stays through a Portrait… none of them followed; no barrier when no map changed; a prototype key is no character (nothing on Object.prototype, no token touched)',
            A11.r === true && A11.camp.chars.c_1.portrait === A11.toks[0].src && !('face' in A11.camp.chars.c_1) && A12.toks[1].type === 'image' && A12.toks[1].color === 'transparent' && !('face' in A12.toks[1]) && A12.toks[0].shape === 'hexagon' && A12.toks[1].shape === 'hexagon'
            && A13.r === true && A13.toks[1].type === 'circle' && A13.toks[1].src === '/saves/images/old.png' && A14.r === false && A14.out.uploads.length === 0
            && A15.r === false && A15.toks[0].src === '/saves/images/old.png' && A15.out.sent.length === 0 && A15.out.prunes.length === 0
            && A16.r === false && A16.toks[0].src === '/saves/images/pp.png' && A16.camp.chars.c_1.portrait === '/saves/images/pp.png' && !('frame' in A16.camp.chars.c_1) && A16.out.after === 0
            && A17.r === true && A17.camp.chars.c_1.portrait !== '/saves/images/face.png' && A17.toks[0].src === '/saves/images/art.png' && A17.toks[1].src === '/saves/images/art.png' && jj(A17.camp.chars.c_1.frame) === jj(keptA) && A18.r === true && jj(A18.camp.chars.c_1.frame) === jj(keptA)
            && A19.r === true && A19.out.barrier === null && [A20, A21].every(x => x.r === false && x.out.uploads.length === 0 && x.toks.every(t => /old|art/.test(t.src))) && protoAfter === protoBefore && ({}).portrait === undefined && ({}).frame === undefined,
            jj([A11.camp.chars.c_1, A12.toks, A13.toks, A16.toks, A17.camp.chars.c_1, A19.out]));

        // applyTokenFrame, run for real
        const tfRun = async (o) => {
            o = o || {};
            const wb = [{ id: 'w1', isChar: true, type: 'image', src: '/saves/images/lib/x.png' }, { id: 'w2', isChar: true, type: 'image', src: '/saves/images/lib/x.png' }, { id: 'w3', isChar: true, type: 'image', src: '/saves/images/lib/x.png' }, { id: 'w4', isChar: true, type: 'image', src: '/saves/images/lib/x.png', charId: 'c_1' }, { id: 'w5', isChar: true, type: 'image', src: '/saves/images/lib/x.png', waiting: 1 }, { id: 'w6', isChar: true, type: 'image', src: '/saves/images/lib/y.png', frame: { src: '/saves/images/a.png', x: 0, y: 0, s: 5, of: '/saves/images/lib/y.png' } },
                { id: 'w7', type: 'rect', src: '/saves/images/lib/x.png' }, { id: '../x', isChar: true, type: 'image', src: '/saves/images/lib/x.png' }];
            const camp = { id: 'k', items: { m1: { id: 'm1', type: 'map', whiteboard: wb }, d1: { id: 'd1', type: 'page' } } };
            let active = camp; const out = { uploads: [], prunes: [], saves: 0, toasts: [] };
            const api = new Function('getActiveCampaign', 'isClient', 'canWrite', 'uploadExact', 'window', 'save', 'prunePics', 'toast', slice('sheets.js', 'tokframe') + '\nreturn applyTokenFrame;')(
                () => active, () => !!o.client, () => o.write !== false, (rel, b) => { out.uploads.push(rel); if (o.during) { const nx = o.during(wb, camp); if (nx) active = nx; } return Promise.resolve('/saves/' + rel); }, { wpSystemCore: SCf }, () => { out.saves++; }, (p, k) => { out.prunes.push([p, k]); }, t => out.toasts.push(t));
            const r = await api(o.map || 'm1', o.ids || ['w1', 'w2', 'w4', 'w5', 'w6'], Object.assign({ blob: new Blob(['x']), was: '/saves/images/lib/x.png', frame: { src: '/saves/images/lib/x.png', x: 3, y: 4, s: 90 } }, o.plan || {}));
            return { r, wb, out, camp };
        };
        const T1 = await tfRun(), T2 = await tfRun({ plan: { frame: null }, ids: ['w6'], }), T3 = await tfRun({ ids: ['../x', 'w1'] }), T4 = await tfRun({ map: 'd1' }), T5 = await tfRun({ map: '__proto__' }), T6 = await tfRun({ client: true }), T7 = await tfRun({ plan: { was: '' } });
        const T8 = await tfRun({ ids: ['w6'], plan: { was: '/saves/images/lib/y.png', frame: null } });
        const tu = T1.wb[0].src;
        check('token creator (GM, applyTokenFrame run for real): the selected plain tokens still wearing the picture take the framed one (one file named after the first, a step of the GM\'s undo — saved like any edit); unselected, a character\'s or a waiting token and one wearing something else keep theirs; the kept original is set (or cleared when not kept); refused: a bad id first, a page or a prototype key for a map, a player\'s machine, nothing it wore',
            T1.r === true && /^\/saves\/images\/portraits\/token-w1-[a-z0-9]{4,12}\.png$/.test(tu) && T1.wb[1].src === tu && T1.wb[2].src === '/saves/images/lib/x.png' && T1.wb[3].src === '/saves/images/lib/x.png' && T1.wb[4].src === '/saves/images/lib/x.png' && T1.wb[5].src === '/saves/images/lib/y.png'
            && jj(T1.wb[0].frame) === jj({ src: '/saves/images/lib/x.png', x: 3, y: 4, s: 90, of: tu }) && T1.wb[0].frame !== T1.wb[1].frame && T1.out.saves === 1 && jj(T1.out.prunes) === jj([['token-w1', [tu, '/saves/images/lib/x.png']]]) && T1.out.uploads.length === 1
            && T2.r === false && [T3, T4, T5, T6, T7].every(x => x.r === false && x.out.uploads.length === 0 && x.out.saves === 0) && T8.r === true && !('frame' in T8.wb[5]) && T8.wb[5].src !== '/saves/images/lib/y.png', jj([T1.wb, T1.out, T8.wb[5]]));
        const T9 = await tfRun({ write: false }), T10 = await tfRun({ plan: { blob: 'data:image/png;base64,AAAA' } }), T11 = await tfRun({ ids: ['w1', 'w7'] }), T12 = await tfRun({ ids: ['w1', '../x'] });
        const T13 = await tfRun({ during: wb => { wb[0].src = '/saves/images/other.png'; } }), T13b = await tfRun({ ids: ['w1'], during: wb => { wb[0].src = '/saves/images/other.png'; } });
        const T14 = await tfRun({ ids: ['w1'], during: (wb, cp) => { delete cp.items.m1; } }), T15 = await tfRun({ ids: ['w1'], during: (wb, cp) => JSON.parse(JSON.stringify(cp)) });
        const T16 = await tfRun({ plan: { frame: { src: 'https://evil.example/x.png', x: 1, y: 2, s: 3 } } });
        check('token creator (GM, applyTokenFrame run for real): refused with nothing uploaded at someone else\'s table or with anything but a picture file; a shape that is not a picture and an id that is not one keep theirs; the tokens are picked again once the picture is saved (one that changed meanwhile keeps its own; none left, a map gone or the campaign switched: nothing written); a kept original that is not a saved picture is never kept',
            T9.r === false && T9.out.uploads.length === 0 && T9.out.saves === 0 && T10.r === false && T10.out.uploads.length === 0 && T11.r === true && T11.wb[6].src === '/saves/images/lib/x.png' && T12.r === true && T12.wb[7].src === '/saves/images/lib/x.png'
            && T13.r === true && T13.wb[0].src === '/saves/images/other.png' && T13.wb[1].src !== '/saves/images/lib/x.png' && T13b.r === false && T13b.out.saves === 0 && T14.r === false && T14.out.saves === 0 && T15.r === false && T15.out.saves === 0 && T15.wb[0].src === '/saves/images/lib/x.png'
            && T16.r === true && !('frame' in T16.wb[0]), jj([T11.wb[6], T12.wb[7], T13.wb.slice(0, 2), T16.wb[0]]));

        // the Image Library counts a kept original (a token's, a character's) and a character's portrait as used (whiteboard.js buildImgIndexFor / imgUsage, run for real)
        const pkL = lineAt(wbF, 'function pathKeys('), ixS = wbF.slice(wbF.indexOf('function buildImgIndexFor('), wbF.indexOf('function buildImgIndex()')), usS = wbF.slice(wbF.indexOf('function imgUsage('), wbF.indexOf('function scopeChip('));
        const bIdx = new Function(pkL + '\n' + ixS + '\nreturn buildImgIndexFor;')();
        const dataI = { campaigns: { k: { name: 'K', items: { m1: { id: 'm1', meta: { title: 'Hall' }, whiteboard: [{ id: 'w', src: '/saves/images/a.png', frame: { src: '/saves/images/orig one.png' } }] } }, chars: { c_1: { portrait: '/saves/images/p.png', frame: { src: '/saves/images/corig.png' } }, c_2: null } }, k2: { name: 'K2', items: {}, chars: '__proto__' } } };
        const idxI = bIdx(dataI), useI = new Function('state', pkL + '\n' + usS + '\nreturn imgUsage;')({ appState: dataI });
        const uT = useI('/saves/images/orig one.png'), uC = useI('/saves/images/corig.png'), uP = useI('/saves/images/p.png'), uN = useI('/saves/images/none.png');
        check('token creator (GM): the Image Library counts a token\'s kept original, a character\'s kept original and its portrait as the campaign\'s and as used (its Delete warns), whatever else a campaign file holds there',
            jj(idxI.refs['/saves/images/orig one.png']) === jj(['k']) && jj(idxI.refs['/saves/images/orig%20one.png']) === jj(['k']) && jj(idxI.refs['/saves/images/corig.png']) === jj(['k']) && jj(idxI.refs['/saves/images/p.png']) === jj(['k'])
            && uT.count === 1 && jj(uT.maps) === jj(['Hall']) && uC.count === 1 && jj(uC.maps) === jj(['the characters of K']) && uP.count === 1 && uN.count === 0, jj([idxI.refs, uT, uC, uP]));

        // the ShadowBase import (shadowbase.js importCharacterToken, run for real): the token art framed from the sheet's portrait
        const sbBody = slice('shadowbase.js', 'sbimport').replace('export function importCharacterToken(', 'function importCharacterToken(').split("(await import('./state.js'))").join('(await __imp())');
        const sbRun = (o) => new Promise(resolve => {
            o = o || {}; const opened = [], uploads = [], toasts = []; let saves = 0;
            const map = { id: 'm1', type: 'map', meta: { gridType: 'hex' }, whiteboard: [] };
            const win = { wpSystemCore: SCf, wpTokenGuide: tokenGuideF, appRender() {}, wpSeatCell() {},
                wpFrame: o.noFrame ? undefined : { open(src, opts, cb) { opened.push({ src, opts }); if (o.mode === 'refuse') return false; if (o.mode === 'cancel') opts.onCancel(); else cb({ blob: 'FRAMED', rect: { x: 4, y: 5, s: 60 }, w: 100, h: 100, keep: o.keep !== false }); return true; } } };
            const fetchS = (u, opt) => { if (/^data:image\//.test(u)) return Promise.resolve({ blob: async () => 'WHOLE' }); const nm = new URL('http://x' + u).searchParams.get('filename'); uploads.push([nm, opt.body]); return Promise.resolve({ json: async () => ({ url: '/saves/images/m1/' + nm }) }); };
            const done = () => resolve({ opened, uploads, toasts, saves, map });
            const fn = new Function('window', 'document', 'fetch', 'toast', 'save', 'canPersistLocal', 'getActiveCampaign', 'getActiveMap', 'isCharFile', 'loadImage', 'toPortrait', 'seedStance', '__imp', 'buildStatsLine', sbBody + '\nreturn importCharacterToken;')(
                win, { getElementById: () => null }, fetchS, t => { toasts.push(t); setTimeout(done, 0); }, () => { saves++; }, () => true, () => ({ id: 'k', activeItemId: 'm1' }), () => map, () => false, async () => ({}),
                o.portraitThrows ? () => { throw new Error('x'); } : () => 'data:image/png;base64,NORM', () => {}, async () => ({ state: {} }), () => '');
            fn({ name: 'ana.json', text: async () => JSON.stringify({ name: 'Ana', type: 'character', portrait: 'data:image/png;base64,ORIG' }) });
        });
        const S1 = await sbRun({}), S2 = await sbRun({ keep: false }), S3 = await sbRun({ mode: 'cancel' }), S4 = await sbRun({ mode: 'refuse' }), S5 = await sbRun({ portraitThrows: true }), S6 = await sbRun({ noFrame: true });
        const it1 = S1.map.whiteboard[0] || {}, gpI = tokenGuideF({ isChar: true, type: 'image', src: 'x', w: 60, h: 52 }, S1.map);
        check('token creator (GM, the ShadowBase import run for real): the creator opens on the sheet\'s normalised portrait (256 px, a PNG blob, the map\'s cell as the outline, Keep the original ticked); OK places the token wearing the framed square and, kept, the whole portrait as its original; not kept: the square alone; Cancel imports nothing; a portrait the creator cannot take, or no creator, gives the whole portrait as before; a portrait that cannot be read: a token with no art',
            !/import\(/.test(sbBody) && S1.opened.length === 1 && S1.opened[0].src === 'data:image/png;base64,NORM' && S1.opened[0].opts.px === 256 && S1.opened[0].opts.as === 'blob' && S1.opened[0].opts.keep === true && typeof S1.opened[0].opts.onCancel === 'function' && jj(S1.opened[0].opts.guide) === jj(gpI) && gpI.shape === 'hexagon'
            && jj(S1.uploads) === jj([['Ana - token.png', 'FRAMED'], ['Ana - portrait.png', 'WHOLE']]) && it1.src === '/saves/images/m1/Ana - token.png' && jj(it1.frame) === jj({ src: '/saves/images/m1/Ana - portrait.png', x: 4, y: 5, s: 60, of: it1.src }) && S1.saves === 1
            && jj(S2.uploads) === jj([['Ana - token.png', 'FRAMED']]) && !('frame' in S2.map.whiteboard[0]) && jj(S3.toasts) === jj(['Import cancelled.']) && S3.uploads.length === 0 && S3.map.whiteboard.length === 0 && S3.saves === 0
            && jj(S4.uploads) === jj([['Ana - token.png', 'WHOLE']]) && !('frame' in S4.map.whiteboard[0]) && jj(S6.uploads) === jj([['Ana - token.png', 'WHOLE']])
            && S5.opened.length === 0 && S5.uploads.length === 0 && S5.map.whiteboard.length === 1 && !S5.map.whiteboard[0].src && !('portrait' in S5.map.whiteboard[0].sheet), jj([S1.opened.map(x => x.src), S1.uploads, it1.frame, S3.toasts, S4.uploads, S5.map.whiteboard]));

        // New character sheet… from a framed token (sheets.js newFromToken, run for real): its kept original goes with its picture
        const nfA = shF.indexOf('function newFromToken('), nfB = shF.indexOf('\nfunction charSelectHtml(');
        const nfRun = w => { const made = { id: 'c_n' }; const fn = new Function('getActiveCampaign', 'newCharacter', 'giveTokenChar', 'afterCharChange', 'window', shF.slice(nfA, nfB) + '\nreturn newFromToken;')(() => ({ id: 'k' }), o => Object.assign(made, o), () => {}, () => {}, { wpSystemCore: SCf }); return fn(w); };
        const frT = { src: '/saves/images/lib/big.png', x: 1, y: 2, s: 30, of: '/saves/images/portraits/token-w1-k.png' };
        const N1 = nfRun({ id: 'w1', src: frT.of, frame: frT }), N2 = nfRun({ id: 'w2', src: '/saves/images/other.png', frame: frT }), N3 = nfRun({ id: 'w3', src: frT.of, frame: Object.assign({}, frT, { src: 'https://evil.example/x.png' }) });
        check('token creator (GM): New character sheet… on a framed token gives the new character the token\'s kept original (so Frame picture… and Portrait… still reopen it); not one for another picture, nor one that is not a saved picture',
            nfA > 0 && nfB > nfA && jj(N1.frame) === jj(frT) && N1.portrait === frT.of && !('frame' in N2) && !('frame' in N3));

        // the room roster's portrait (inspector.js, run for real): framed first; Keep the original only with a linked token to hold it
        const rpBody = slice('inspector.js', 'rosterportrait');
        const rpRun = async (o) => {
            o = o || {}; const uploads = [], opened = []; let n = 0, saves = 0;
            const toks = (o.toks || [{ id: 't1', isChar: true, type: 'hexagon', w: 60, h: 52, x: 0, y: 0, frame: { src: '/saves/images/stale.png', x: 0, y: 0, s: 5, of: '/saves/images/x.png' } }, { id: 't2', isChar: true, type: 'hexagon', w: 60, h: 52, x: 0, y: 0 }]);
            const c = { name: 'Ana' }, f = Object.assign({ name: 'Ana.jpg', type: 'image/jpeg' }, o.f || {}), am = { id: 'm', meta: { gridType: 'hex' } };
            let ltCalls = 0; const ltStub = () => (o.goneAfterOpen && ltCalls++ > 0 ? [] : toks);
            const fetchR = (u, opt) => { n++; uploads.push({ name: new URL('http://x' + u).searchParams.get('filename'), body: opt.body }); const k = n; return Promise.resolve({ json: () => Promise.resolve({ url: '/saves/images/m/up' + k + '.png' }) }); };
            const win = { wpSystemCore: SCf, wpTokenGuide: tokenGuideF, wpFrame: o.noFrame ? undefined : { open(src, opts, cb) { opened.push(opts); if (o.refuse) return false; cb({ blob: 'BLOB', rect: { x: 1, y: 2, s: 30 }, w: 256, h: 256, keep: typeof opts.keep === 'boolean' ? o.keep !== false : false }); return true; } } };
            new Function('getActiveCampaign', 'fetch', 'toast', 'c', 'f', 'activeMap', 'linkedTokens', 'window', 'save', 'render', rpBody)(() => ({ activeItemId: 'm' }), fetchR, () => {}, c, f, am, ltStub, win, () => { saves++; }, () => {});
            await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
            return { uploads, opened, toks, c, saves };
        };
        const P7 = await rpRun({ goneAfterOpen: true }), P1 = await rpRun({}), P2 = await rpRun({ keep: false }), P3 = await rpRun({ toks: [] }), P4 = await rpRun({ refuse: true, f: { type: 'image/heic' } }), P5 = await rpRun({ refuse: true, f: { type: '' } }), P6 = await rpRun({ noFrame: true });
        check('token creator (GM, the roster portrait run for real): framed first (256 px, a PNG blob, the linked token\'s outline, the GM\'s own file up to 64 MB); kept: the framed square and the whole file uploaded, every linked token wears the square and holds its own copy of the kept original; not kept: one upload, a stale kept original dropped; no linked token: Keep the original not offered, one upload; a picture the creator refuses goes up as it is (a file that is no image does not); no creator: as before',
            P1.opened.length === 1 && P1.opened[0].px === 256 && P1.opened[0].as === 'blob' && P1.opened[0].keep === true && P1.opened[0].maxInput === 64 * 1024 * 1024 && jj(P1.opened[0].guide) === jj({ shape: 'hexagon', w: 60, h: 52 })
            && jj(P1.uploads.map(u => [u.name, u.body === 'BLOB' ? 'BLOB' : 'FILE'])) === jj([['Ana - framed.png', 'BLOB'], ['Ana.jpg', 'FILE']]) && P1.c.portrait === '/saves/images/m/up1.png' && P1.toks.every(t => t.src === '/saves/images/m/up1.png' && jj(t.frame) === jj({ src: '/saves/images/m/up2.png', x: 1, y: 2, s: 30, of: '/saves/images/m/up1.png' })) && P1.toks[0].frame !== P1.toks[1].frame && P1.saves === 1
            && P2.uploads.length === 1 && P2.toks.every(t => !('frame' in t)) && P3.opened[0].keep === undefined && P3.uploads.length === 1
            && jj(P4.uploads.map(u => u.name)) === jj(['Ana.jpg']) && P5.uploads.length === 0 && jj(P6.uploads.map(u => u.name)) === jj(['Ana.jpg']) && P7.opened[0].keep === true && jj(P7.uploads.map(u => u.name)) === jj(['Ana - framed.png']), jj([P1.opened[0], P1.uploads.map(u => u.name), P1.toks, P2.toks, P3.opened, P4.uploads.map(u => u.name)]));
        // Onboarding F4: what came of a fill (sheets.js fillNote, run for real) names the file's own labels — text for a toast, never markup
        const XPx = await import(modUrl('sheetexport.js')), fnS = slice('sheets.js', 'fillnote');
        const sysN = { v: 1, name: 'N', rolls: [], fields: [{ id: 'f_st', key: 'ST', label: 'ST', kind: 'number', vis: 'all' }], items: [], effects: [] };
        const fnote = (a, j2) => new Function('getActiveCampaign', 'isCharFile', 'charFromJson', 'window', 'F', fnS + '\nreturn fillNote;')(() => ({ system: sysN }), XPx.isCharFile, XPx.charFromJson, { wpSystemCore: SCf }, () => null)(a, j2);
        const evil = '<img src=x onerror=alert(1)>';
        const cf = { format: 'waypoint-character', v: 1, name: 'V', system: { sig: 'x', fields: { f_q: { key: 'Q', kind: 'number', label: evil } } }, values: { f_q: 3 } };
        const n1 = fnote({ auto: 2, left: 1 }, cf), n2 = fnote({ auto: 0, left: 0 }, { name: 'V', attributes: {} }), shN = read('sheets.js'), ioN = read('io.js');
        check('Onboarding F4: what came of a fill is text — the host\'s counts and the file\'s own labels this campaign has no place for (a label that is markup stays text), shown only by toast, which writes textContent',
            n1 === '2 parts filled in; 1 part could not be taken; not in this campaign: ' + evil + '.' && n2 === 'Nothing could be filled in.' && /toast\(a\.error \|\| fillNote\(a, j\)\)/.test(shN) && /toast\(fillNote\(b, j\)\)/.test(shN) && (shN.match(/fillNote\(/g) || []).length === 3
            && /export function toast\(msg\) \{[\s\S]{0,120}document\.getElementById\('toastMsg'\)\.textContent = msg;/.test(ioN), JSON.stringify([n1, n2]));
        const FXn = await import(modUrl('formula.js')), sysA = SCf.cleanSystem({ v: 1, name: 'A', rolls: [], fields: [{ id: 'f_lc', key: 'Locations', label: 'Locations', kind: 'item-list', vis: 'all', list: {} }] }, { F: FXn, gmView: false });
        const nA = new Function('getActiveCampaign', 'isCharFile', 'charFromJson', 'window', 'F', fnS + '\nreturn fillNote;')(() => ({ system: sysA }), XPx.isCharFile, XPx.charFromJson, { wpSystemCore: SCf }, () => FXn)({ auto: 1, left: 0 }, { name: 'V', characteristics: { locations: [{ name: 'Left Arm', isAmputated: true }, { name: 'Torso' }] }, inventory: { general: [{ name: 'Rope' }] } });
        check('Onboarding F4: a hit location left out because it is amputated is said so, never "not in this campaign" (that is for what the campaign has no place for)',
            nA === '1 part filled in; not in this campaign: gear; left out as amputated: Left Arm.', nA);
        // Onboarding F4b: a file's own picture (sheets.js filePicture, run for real) — framed first, only a PNG, JPEG or WebP data URL; else its own face
        const netH = read('net.js'), hF = new Function('localStorage', 'crypto', netH.slice(netH.indexOf('// [netcheck:helpers-start]'), netH.indexOf('// [netcheck:helpers-end]')) + '\nreturn { cleanFace };')({ getItem: () => null, setItem() {} }, globalThis.crypto);
        const fpS = slice('sheets.js', 'filepic');
        const fpRun = (j2, o) => { o = o || {}; const out = { opened: [], pics: [], toasts: [] };
            const win = o.noFrame ? {} : { wpFrame: { open(src, opts, cb) { out.opened.push({ type: src && src.type, size: src && src.size, opts }); if (o.refuse) return false; cb({ data: 'data:image/png;base64,FRAMED' }); return true; } } };
            const r = new Function('net', 'toast', 'window', fpS + '\nreturn filePicture;')(() => ({ charPic: (id, face, img, cb) => { out.pics.push([id, face, img]); }, cleanFace: hF.cleanFace }), t => out.toasts.push(t), win)('c_1', j2);
            return Object.assign(out, { r }); };
        const png = 'data:image/png;base64,' + Buffer.from('PNGDATA').toString('base64');
        const q1 = fpRun({ picture: png }), q2 = fpRun({ portrait: png }), q3 = fpRun({ picture: 'data:image/svg+xml;base64,PHN2Zz4=', face: '\u{1F409}' }), q4 = fpRun({ portrait: 'https://evil.example/x.png' }), q5 = fpRun({ face: 'photo' });
        const q6 = fpRun({ picture: 'data:image/png;base64,' + 'A'.repeat(12 * 1024 * 1024 + 8) }), q7 = fpRun({ picture: png }, { noFrame: true }), q8 = fpRun({ picture: 'data:image/png;base64,AB<script>' }), q9 = fpRun({ face: '<img src=x>' });
        check('Onboarding F4b: a file\'s own picture (filePicture, run for real) — a PNG, JPEG or WebP data URL (a character file\'s picture, a ShadowBase portrait) opens the token creator on its bytes (256 px, a data URL within 200,000) and goes as the character\'s picture (char-pic checks it again); an SVG, a web address, anything malformed or past 12 MB never does; else its own face (never "photo", nothing that is not a face); nothing without either',
            q1.r === true && q1.opened.length === 1 && q1.opened[0].type === 'image/png' && q1.opened[0].size === 7 && q1.opened[0].opts.px === 256 && q1.opened[0].opts.as === 'data' && q1.opened[0].opts.max === 200000 && JSON.stringify(q1.pics) === JSON.stringify([['c_1', '', 'data:image/png;base64,FRAMED']])
            && q2.opened.length === 1 && q3.opened.length === 0 && JSON.stringify(q3.pics) === JSON.stringify([['c_1', '\u{1F409}', '']]) && q4.r === false && q4.opened.length === 0 && q4.pics.length === 0 && q5.r === false && q5.pics.length === 0
            && q6.opened.length === 0 && q7.r === false && q7.pics.length === 0 && q8.opened.length === 0 && q9.r === false && q9.pics.length === 0, JSON.stringify([q1, q3.pics, q4, q5, q9]));
    }
    {   // chat cards (owner 2026-09-27): the viewer's system look reaches #chatLog's style only as strict #rrggbb custom properties (net.js, sliced), a tone only dark or light
        const j = JSON.stringify;
        const DCs = await import(modUrl('dicecore.js')), ckS = slice('net.js', 'cardlook');
        const mkCk = win => new Function('window', "'use strict';\n" + ckS + '\nreturn { paint: paintCardLook, now: cardLookNow, set: function(v) { _cardLook = v; } };')(win);
        const fakeLog = () => { const props = {}; return { props, dataset: {}, style: { setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; } } }; };
        const hostile = { accent: 'red;background:url(//x.test/a)', palette: { text: '#fff', muted: 'var(--x)', panel: 'expression(1)', card: '#212121', field: '#262626', edge: '#333333', primary: '#add8e6)url(', danger: '#cc3333', good: '#4ade80', warn: '#f59e0b' } };
        const pal0 = { text: '#add8e6', muted: '#8c8c8c', panel: '#1a1a1a', card: '#212121', field: '#262626', edge: '#333333', primary: '#add8e6', danger: '#cc3333', good: '#4ade80', warn: '#f59e0b' };
        const sysOf = look => () => ({ sheet: { look } }), winOf = (look, o) => Object.assign({ wpDiceCore: DCs, wpVtt: { on: () => !(o && o.off) }, wpSheets: { systemOf: sysOf(look) } }, o && o.pop ? { wpPopout: true } : {});
        const k1 = mkCk(winOf(hostile)), l1 = fakeLog(); k1.paint(l1, k1.now());
        const k2 = mkCk(winOf({ palette: pal0, accent: '#ab94b3' })), l2 = fakeLog(); k2.paint(l2, k2.now());
        const k3 = mkCk(winOf({ palette: pal0 }, { off: true })), l3 = fakeLog(); k3.paint(l3, k3.now());
        const k4 = mkCk(winOf(null, { pop: true })), l4 = fakeLog(); k4.set({ primary: 'url(x)', good: '#00ff00', tone: 'dim' }); k4.paint(l4, k4.now()); const l4b = fakeLog(); k4.set({ primary: '#ABCDEF', bad: 'red', tone: 'light' }); k4.paint(l4b, k4.now());
        const l5 = fakeLog(); k2.paint(l5, k2.now()); k2.paint(l5, null);
        const l6 = fakeLog(); k2.paint(l6, { primary: '#123456; x', good: '#00ff00', tone: '"><img>' });
        const hexOnly = p => Object.keys(p).every(k => /^--card-(t-)?(primary|good|bad|muted|accent)$/.test(k) && /^#[0-9a-f]{6}$/.test(p[k]));
        check('Chat cards: a campaign\'s look reaches the chat\'s style only as strict #rrggbb custom properties (a style, url, var or expression in its palette sets nothing), its tone only dark or light; none while character sheets are off; a chat pop-out takes the main window\'s colours checked again (nothing without a good primary); a look gone clears them',
            j(l1.props) === '{}' && !l1.dataset.cardTone && hexOnly(l2.props) && j(l2.props) === j({ '--card-primary': '#add8e6', '--card-t-primary': '#add8e6', '--card-good': '#4ade80', '--card-t-good': '#4ade80', '--card-bad': '#cc3333', '--card-t-bad': '#cc3333', '--card-muted': '#8c8c8c', '--card-accent': '#ab94b3' }) && l2.dataset.cardTone === 'dark'
            && j(l3.props) === '{}' && j(l4.props) === '{}' && !l4.dataset.cardTone && j(l4b.props) === j({ '--card-primary': '#abcdef', '--card-t-primary': '#abcdef' }) && l4b.dataset.cardTone === 'light'
            && j(l5.props) === '{}' && !l5.dataset.cardTone && j(l6.props) === j({ '--card-good': '#00ff00', '--card-t-good': '#00ff00' }) && !l6.dataset.cardTone, j([l1.props, l2.props, l4.props, l4b.props, l6]));
        // the delivery (net.js, sliced from the colours through the relay): renderChat paints #chatLog and sends the colours to a pop-out; a system change
        // repaints and sends once; a pop-out takes them checked again; the stream window never speaks on the relay (its empty log would wipe the pop-out)
        const netS = read('net.js'), dvS = netS.slice(netS.indexOf('// [sinkcheck:cardlook-start]'), netS.indexOf('// A roll opens Table Chat if it was closed'));
        const mkRelay = (win, log) => { const posts = [], lis = []; function BC() {} BC.prototype.postMessage = m => posts.push(JSON.parse(JSON.stringify(m))); BC.prototype.addEventListener = (t, f) => lis.push(f);
            const doc = { createDocumentFragment: () => ({ children: [], appendChild(c) { this.children.push(c); } }) };
            const api = new Function('window', 'ui', 'document', 'BroadcastChannel', 'chatEntryNode', 'sendChat', "'use strict';\nvar chatLog = [], chatUnread = 0;\n" + dvS + '\nreturn { render: renderChat, log: function() { return chatLog; } };')(win, id => id === 'chatLog' ? log : null, doc, BC, () => null, () => {});
            return { api, posts, lis }; };
        const dLog = () => { const l = fakeLog(); l.textContent = ''; l.appendChild = () => {}; l.scrollTop = 0; l.scrollHeight = 0; return l; };
        let lookNow = { palette: pal0, accent: '#ab94b3' }; const wMain = { wpDiceCore: DCs, wpVtt: { on: () => true }, wpSheets: { systemOf: () => ({ sheet: { look: lookNow } }) } }, lgM = dLog(), rM = mkRelay(wMain, lgM);
        rM.api.render(); const props1 = JSON.parse(JSON.stringify(lgM.props)), tone1 = lgM.dataset.cardTone, post1 = rM.posts[rM.posts.length - 1]; const nAfter1 = rM.posts.length; wMain.wpChat.lookSync(); const quiet = rM.posts.length === nAfter1;
        lookNow = { accent: '#010203' }; wMain.wpChat.lookSync(); const post2 = rM.posts[rM.posts.length - 1], nAfter2 = rM.posts.length;
        const wPop = { wpDiceCore: DCs, wpPopout: true, wpVtt: { on: () => true }, wpSheets: { systemOf: () => null } }, lgP = dLog(), rP = mkRelay(wPop, lgP);
        rP.lis.forEach(f => f({ data: { type: 'chatSync', log: [], look: { primary: '#ABCDEF', good: 'url(x)', bad: '#123456', tone: 'light' } } }));
        const wSt = { wpDiceCore: DCs, wpStream: true, wpVtt: { on: () => true }, wpSheets: { systemOf: () => ({ sheet: { look: { palette: pal0 } } }) } }, rS = mkRelay(wSt, dLog());
        rS.api.render(); wSt.wpChat.lookSync(); rS.lis.forEach(f => f({ data: { type: 'chatReq' } }));
        check('Chat cards: the colours travel — renderChat paints #chatLog and posts them with the log to a pop-out; the same look again posts nothing, a changed one repaints and posts once; a pop-out paints what it is sent only as checked #rrggbb; the stream window never posts on the relay, nor answers a pop-out',
            props1['--card-primary'] === '#add8e6' && tone1 === 'dark' && post1 && post1.type === 'chatSync' && post1.look && post1.look.accent === '#ab94b3' && quiet
            && lgM.props['--card-primary'] === '#010203' && !('--card-good' in lgM.props) && !lgM.dataset.cardTone && nAfter2 === nAfter1 + 1 && post2.look.primary === '#010203'
            && j(lgP.props) === j({ '--card-primary': '#abcdef', '--card-t-primary': '#abcdef', '--card-bad': '#123456', '--card-t-bad': '#123456' }) && lgP.dataset.cardTone === 'light' && rS.posts.length === 0,
            j([lgM.props, post1 && post1.look, post2 && post2.look, lgP.props, rS.posts.length]));
    }
    /* ---- targeting (the owner's ruling of 2026-10-01): a player targets by the token's right-click menu or T — the menu, sliced by its targetmenu markers and run on a recording menu ---- */
    {
        const j = JSON.stringify, wbTm = read('whiteboard.js');
        const mkTm = opt => {
            const o = opt || {}, calls = { placed: 0, set: [], rows: [] };
            const row = { listeners: {}, addEventListener(k, h) { this.listeners[k] = h; } };
            const cMenu = { onclick: () => {}, innerHTML: '', style: { display: 'none' }, querySelector: sel => (sel === '.cm-target' && /cm-target/.test(cMenu.innerHTML) ? row : null) };
            const net = o.noNet ? null : Object.assign({ active: true, role: 'client', myId: 'u_a', targets: o.targets || {}, setTarget: (id, mapId, name) => calls.set.push([id, mapId, name]) }, o.net || {});
            const win = { wpNet: net }; if (o.stream) win.wpStream = {};
            const api = new Function('esc', 'window', 'document', 'placeMenu', "'use strict';\n" + slice('whiteboard.js', 'targetmenu') + '\nreturn { canTarget: canTarget, targetedByMe: targetedByMe, toggleTarget: toggleTarget, showTargetMenu: showTargetMenu };')(SC.esc, win, { getElementById: id => (id === 'contextMenu' && !o.noMenu ? cMenu : null) }, () => { calls.placed++; });
            return { api, calls, cMenu, row, click: () => { row.listeners.click({ stopPropagation() {} }); } };
        };
        const tokT = extra => Object.assign({ id: 't1', isChar: true, ownerId: 'u_b', charName: T, name: P }, extra || {});
        const M1 = mkTm(), shown = M1.api.showTargetMenu({ clientX: 10, clientY: 10 }, tokT(), 'm1'), html1 = M1.cMenu.innerHTML;
        check('target menu: a hostile token name lands escaped as the menu\'s heading and nothing in the menu can run or call out; the one row reads Target with a fixed title; the menu is shown and placed; its click sends setTarget with the token\'s id, the map and the name, and closes the menu',
            shown === true && risks(html1).length === 0 && html1.indexOf(T) < 0 && html1.indexOf('<img') < 0 && html1.indexOf(SC.esc(T)) >= 0 && /<div class="menu-item cm-target" title="Mark it as your target[^"]*">&#9678; Target<\/div>$/.test(html1) && M1.cMenu.style.display === 'flex' && M1.calls.placed === 1
            && (M1.click(), j(M1.calls.set) === j([['t1', 'm1', T]]) && M1.cMenu.style.display === 'none'), [html1, M1.calls]);
        const M2 = mkTm({ targets: { u_a: { id: 't1', mapId: 'm1' } } }); M2.api.showTargetMenu({ clientX: 0, clientY: 0 }, tokT(), 'm1'); const html2 = M2.cMenu.innerHTML; M2.click();
        const M3 = mkTm(); const noName = (M3.api.showTargetMenu({ clientX: 0, clientY: 0 }, tokT({ charName: '', name: '' }), 'm1'), M3.cMenu.innerHTML);
        check('target menu: a token that is their target already reads Clear target (its click sends the same setTarget, which toggles); a token with no name reads Token; targetedByMe reads the player\'s own pointer by the token\'s id only',
            /&#9711; Clear target<\/div>$/.test(html2) && j(M2.calls.set) === j([['t1', 'm1', T]]) && M2.api.targetedByMe(tokT()) === true && M2.api.targetedByMe(tokT({ id: 't2' })) === false && M1.api.targetedByMe(tokT()) === false && />Token<\/div>/.test(noName), [html2, noName]);
        const can = (extra, opt) => mkTm(opt).api.canTarget(extra === null ? null : tokT(extra));
        check('target menu: canTarget only for a shown character token that is not their own nor a waiting one, at a table as a player, never in the stream window, as a host or with no session',
            can({}) === true && can(null) === false && can({ isChar: false }) === false && can({ hidden: true }) === false && can({ hidden: 1 }) === false && can({ waiting: true }) === false && can({ ownerId: 'u_a' }) === false && can({ ownerId: undefined }) === true
            && can({}, { net: { role: 'host' } }) === false && can({}, { net: { active: false } }) === false && can({}, { stream: true }) === false && can({}, { noNet: true }) === false);
        const M4 = mkTm({ net: { role: 'host' } }), h4 = M4.api.showTargetMenu({ clientX: 0, clientY: 0 }, tokT(), 'm1'), M5 = mkTm({ noMenu: true }), h5 = M5.api.showTargetMenu({ clientX: 0, clientY: 0 }, tokT(), 'm1');
        const M6 = mkTm(), t6 = [M6.api.toggleTarget(tokT({ hidden: true }), 'm1'), M6.api.toggleTarget(tokT(), 7), M6.api.toggleTarget(tokT(), 'm1')];
        check('target menu: no menu and no send where the token cannot be targeted or there is no menu element; toggleTarget sends nothing for such a token or a map id that is no text, and sends for a good one',
            h4 === false && M4.calls.placed === 0 && M4.cMenu.innerHTML === '' && h5 === false && j(t6) === j([false, false, true]) && j(M6.calls.set) === j([['t1', 'm1', T]]));
        const wtA = wbTm.indexOf('  (function wireTargeting() {'), wtB = wbTm.indexOf('  // [sinkcheck:targetmenu-start]'), wtSrc = wtA >= 0 && wtB > wtA ? wbTm.slice(wtA, wtB) : '';
        check('targeting (source): a plain click targets nothing — wireTargeting sends no target and keeps only the door click; T while pointing at a token toggles the target (never while typing or with a modifier); a player\'s right-click on another\'s token opens the target menu (their own token keeps its stance menu, a waiting token its card); the party list\'s Target row stays',
            wtSrc.length > 0 && !/setTarget/.test(wtSrc) && /doorReq\(d\.mapId, d\.doorId\)/.test(wtSrc) && /if \(e\.key !== 't' && e\.key !== 'T'\) return;/.test(wtSrc) && /if \(e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey \|\| !e\.target \|\| \(e\.target\.tagName && \/\^\(INPUT\|TEXTAREA\|SELECT\)\$\/\.test\(e\.target\.tagName\)\) \|\| e\.target\.isContentEditable\) return;/.test(wtSrc)
            && /var hov = document\.querySelector\('#whiteboard \.wb-item:hover'\), am = getActiveMap\(\);/.test(wtSrc) && /if \(tok && canTarget\(tok\)\) \{ e\.preventDefault\(\); toggleTarget\(tok, am\.id\); \}/.test(wtSrc)
            && /showStanceMenu\(e, tokO\); \}\n\s*else if \(tokO && canTarget\(tokO\)\) \{ e\.preventDefault\(\); showTargetMenu\(e, tokO, amO\.id\); \}/.test(wbTm) && (wbTm.match(/showTargetMenu\(/g) || []).length === 2 && /items\.push\(\{ act: 'target', label: '\\u25CE Target ' \+ name \}\);/.test(wbTm));
    }
    /* ---- Lighting L4: the system's light rules on the GM's screen — a preset's name and a level's name come from a system file, a light's own name from a save or the wire ---- */
    {
        const j = JSON.stringify, FCl = await import(modUrl('fogcore.js')), SYl = await import(modUrl('systemcore.js'));
        const inspL = read('inspector.js'), wbL = read('whiteboard.js');
        const escLine = /\n  function esc\(s\)\{[^\n]*\}\n/.exec(inspL);
        const escI = escLine ? new Function(escLine[0] + '\nreturn esc;')() : null;
        check('light block: the inspector\'s own esc slices out and turns a tag and a quote into text', !!escI && escI(T + '"') === '&lt;img src=x onerror=alert(1)&gt;&quot;');
        const hostileSys = () => ({ combat: { light: { names: { dim: T, dark: P }, presets: [{ name: T, bright: 5, dim: 10 }, { name: P, bright: 20, dim: 40, unit: 'ft', pick: true }, { name: 'Lantern', bright: 3, dim: 3, unit: 'cells' }, { name: '', bright: 4, dim: 4 }, { name: 'Junk unit', bright: 2, dim: 6, unit: P }] } } });
        const mkInsp = (camp, opt) => {
            const calls = { toasts: [], saves: 0, renders: 0, inspectors: 0, vision: 0 }, o = opt || {};
            const win = { wpSystemCore: SYl, wpFog: { lightCount: () => o.count || 0, invalidateVision() { calls.vision++; }, redraw() {} } };
            if (!o.noCore) win.wpFogCore = FCl;
            const env = { getActiveCampaign: () => camp, window: win, toast: m => calls.toasts.push(m), save: () => { calls.saves++; }, render: () => { calls.renders++; }, renderInspector: () => { calls.inspectors++; } };
            const api = new Function('env', 'esc', "'use strict';\nvar getActiveCampaign = env.getActiveCampaign, window = env.window, toast = env.toast, save = env.save, render = env.render, renderInspector = env.renderInspector;\n" + slice('inspector.js', 'lightfield') + '\nreturn { lightPresetsNow: lightPresetsNow, lightFieldHtml: lightFieldHtml, applyLightPreset: applyLightPreset };')(env, escI || SC.esc);
            api.calls = calls; return api;
        };
        const optsOf = (html, id) => { const m = new RegExp('<select id="' + id + '"[^>]*>([\\s\\S]*?)</select>').exec(html); return m ? Array.from(m[1].matchAll(/<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g)).map(x => [x[1], !!x[2], x[3]]) : null; };
        const valOf = (html, id) => { const m = new RegExp('<input type="number" id="' + id + '"[^>]* value="([^"]*)"').exec(html); return m ? m[1] : null; };
        const campL = { id: 'c1', system: hostileSys() }, I1 = mkInsp(campL), presets = I1.lightPresetsNow();
        check('light block: the presets offered are the system\'s cleaned ones (one with no name goes, a unit the app does not know is dropped); none without a campaign or a system',
            j(presets) === j([{ name: T, bright: 5, dim: 10 }, { name: P, bright: 20, dim: 40, unit: 'ft', pick: true }, { name: 'Lantern', bright: 3, dim: 3, unit: 'cells' }, { name: 'Junk unit', bright: 2, dim: 6 }])
            && j(mkInsp(null).lightPresetsNow()) === '[]' && j(mkInsp({ id: 'c2' }).lightPresetsNow()) === '[]' && j(mkInsp({ id: 'c3', system: { combat: { light: 'x' } } }).lightPresetsNow()) === '[]', j(presets));
        // a light whose own name is hostile and matches no preset, over hostile presets
        const ownName = P + T, hA = I1.lightFieldHtml({ type: 'light' }, FCl.cleanLight({ bright: 7, dim: 9, name: ownName }), presets), oA = optsOf(hA, 'wbLightPreset');
        check('light block: hostile preset names and a light\'s own hostile name render without a crash and nothing in the block can run or call out', risks(hA).length === 0 && hA.indexOf(T) < 0 && hA.indexOf(P) < 0 && hA.indexOf('onmouseover="') < 0, risks(hA));
        check('light block: every name lands escaped as an option\'s text; the option values are the empty one and list positions only',
            !!oA && oA.length === 5 && j(oA.map(o => o[0])) === j(['', '0', '1', '2', '3']) && oA[0][2] === escI(ownName) + ' (as placed)' && oA[1][2] === escI(T) + ' (5 / 10 yd)' && oA[2][2] === escI(P) + ' (20 / 40 ft)' && oA[3][2] === 'Lantern (3 / 3 cells)' && oA[4][2] === 'Junk unit (2 / 6 yd)', oA);
        check('light block: a light whose name matches no preset reads "(as placed)" and is the one selected; the same name with other radii or another unit is as placed too',
            !!oA && j(oA.map(o => o[1])) === j([true, false, false, false, false])
            && j(optsOf(I1.lightFieldHtml({ type: 'light' }, { bright: 3, dim: 4, unit: 'cells', name: 'Lantern' }, presets), 'wbLightPreset').map(o => o[1])) === j([true, false, false, false, false])
            && j(optsOf(I1.lightFieldHtml({ type: 'light' }, { bright: 3, dim: 3, name: 'Lantern' }, presets), 'wbLightPreset').map(o => [o[1], o[2]])[0]) === j([true, 'Lantern (as placed)']), oA);
        const oB = optsOf(I1.lightFieldHtml({ isChar: true }, { bright: 3, dim: 3, unit: 'cells', name: 'Lantern' }, presets), 'wbLightPreset'), oC = optsOf(I1.lightFieldHtml({ isChar: true }, { bright: 5, dim: 10 }, presets), 'wbLightPreset'), oD = optsOf(I1.lightFieldHtml({ isChar: true }, { bright: 20, dim: 40, unit: 'ft', name: P }, presets), 'wbLightPreset');
        check('light block: a light copied from a preset (the same name, radii and unit) shows that preset selected; a light with no name shows Custom',
            j(oB.map(o => o[1])) === j([false, false, false, true, false]) && oB[0][2] === 'Custom' && j(oC.map(o => o[1])) === j([true, false, false, false, false]) && oC[0][2] === 'Custom' && j(oD.map(o => o[1])) === j([false, false, true, false, false]), [oB, oC, oD]);
        const noPre = I1.lightFieldHtml({ type: 'light' }, { bright: 5, dim: 10 }, []), noPreNull = I1.lightFieldHtml({ isChar: true }, null, 'junk'), nameOnly = I1.lightFieldHtml({ type: 'light' }, { bright: 5, dim: 10, name: T }, []);
        check('light block: no preset select when the system has no presets and the light no name; a named light alone shows its one "(as placed)" option',
            noPre.indexOf('wbLightPreset') < 0 && noPreNull.indexOf('wbLightPreset') < 0 && valOf(noPreNull, 'wbLightBright') === '0' && valOf(noPreNull, 'wbLightDim') === '0' && !/id="wbLightOn" checked/.test(noPreNull) && /id="wbLightOn" checked/.test(noPre)
            && j(optsOf(nameOnly, 'wbLightPreset')) === j([['', true, escI(T) + ' (as placed)']]) && risks(nameOnly).length === 0, [noPre.slice(0, 200), optsOf(nameOnly, 'wbLightPreset')]);
        const unitSel = u => { const o = optsOf(I1.lightFieldHtml({ type: 'light' }, u === undefined ? { bright: 5, dim: 10 } : { bright: 5, dim: 10, unit: u }, presets), 'wbLightUnit'); return o ? [o.map(x => x[0]).join(), o.map(x => x[2]).join(), o.filter(x => x[1]).map(x => x[0]).join()] : null; };
        const hJunk = I1.lightFieldHtml({ type: 'light' }, { bright: 5, dim: 10, unit: P, name: 'n' }, presets);
        check('light block: the unit select offers exactly yd, ft, m and cells with the light\'s own selected; no unit, or one the app does not know, shows yd and never reaches the markup',
            j(unitSel(undefined)) === j(['yd,ft,m,cells', 'yd,ft,m,cells', 'yd']) && unitSel('ft')[2] === 'ft' && unitSel('m')[2] === 'm' && unitSel('cells')[2] === 'cells' && unitSel(P)[2] === 'yd' && unitSel('constructor')[2] === 'yd' && unitSel(T)[2] === 'yd'
            && hJunk.indexOf(P) < 0 && risks(hJunk).length === 0, [unitSel(undefined), unitSel(P)]);
        const hStr = I1.lightFieldHtml({ type: 'light' }, { bright: '7" onfocus="alert(1)', dim: '12', off: true }, [{ name: 'Odd', bright: T, dim: '9" onfocus="x', unit: T }]);
        check('light block: the radii in value="" are numbers even when the light or a preset holds strings; a light switched off shows unticked',
            valOf(hStr, 'wbLightBright') === '0' && valOf(hStr, 'wbLightDim') === '12' && risks(hStr).length === 0 && hStr.indexOf('onfocus') < 0 && hStr.indexOf(T) < 0 && j(optsOf(hStr, 'wbLightPreset')) === j([['', true, 'Custom'], ['0', false, 'Odd (0 / 0 yd)']]) && !/id="wbLightOn" checked/.test(hStr), [valOf(hStr, 'wbLightBright'), valOf(hStr, 'wbLightDim'), optsOf(hStr, 'wbLightPreset')]);
        check('light block: a light source and a token that carries a light read as before (their label, the note that players never see the marker)',
            /<label for="wbLightBright">Light<\/label>/.test(noPre) && / Players see its light, never this marker\.<\/div>$/.test(noPre) && /<label for="wbLightBright">Carries a light<\/label>/.test(noPreNull) && noPreNull.indexOf('never this marker') < 0);

        // applyLightPreset, run for real against the real fogcore and the real systemcore
        const campP = { id: 'c1', system: hostileSys() }, I2 = mkInsp(campP), tokP = { id: 't', isChar: true, light: { bright: 1, dim: 2, off: true } };
        I2.applyLightPreset(tokP, '1', { id: 'm' });
        const copied = j(tokP.light), heldBefore = tokP.light;
        campP.system.combat.light.presets[1].bright = 33; campP.system.combat.light.presets[1].name = 'Renamed'; campP.system.combat.light.presets.length = 0;
        check('light preset: a preset picked is copied onto the item by value, its name with it, on or off as the light was (never "players may pick"); a later change to the list changes no light',
            copied === j({ bright: 20, dim: 40, off: true, unit: 'ft', name: P }) && j(tokP.light) === copied && tokP.light === heldBefore && I2.calls.saves === 1 && I2.calls.renders === 1 && I2.calls.inspectors === 1 && I2.calls.vision === 1 && I2.calls.toasts.length === 0, [copied, tokP.light, I2.calls]);
        const I3 = mkInsp({ id: 'c1', system: hostileSys() }), tokOn = { id: 't', isChar: true, light: { bright: 9, dim: 9 } }, srcNew = { id: 's', type: 'light' };
        I3.applyLightPreset(tokOn, '2', { id: 'm' }); I3.applyLightPreset(srcNew, '0', { id: 'm' });
        check('light preset: a light that was on stays on; a light source with no light yet takes the preset (yards carry no unit)', j(tokOn.light) === j({ bright: 3, dim: 3, unit: 'cells', name: 'Lantern' }) && j(srcNew.light) === j({ bright: 5, dim: 10, name: T }) && I3.calls.saves === 2, [tokOn.light, srcNew.light]);
        const tokC = { id: 't', isChar: true, light: { bright: 20, dim: 40, off: true, unit: 'ft', name: 'Torch' } };
        I3.applyLightPreset(tokC, '', { id: 'm' });
        check('light preset: "Custom" keeps the radii, the unit and on or off, and lets the name go', j(tokC.light) === j({ bright: 20, dim: 40, off: true, unit: 'ft' }), tokC.light);
        const oddSaves = I3.calls.saves, oddInsp = I3.calls.inspectors;
        const odd = ['99', '4', '-1', '1.5', '__proto__', 'constructor', 'length', 'toString', 'NaN', 'Infinity', '1e9', ' ', '0x1', '1e0', ' 1', '0.0', '+1', '0000', '00', '01', '002'].map(v => { const w = { id: 't', isChar: true, light: { bright: 20, dim: 40, unit: 'ft', name: 'Torch' } }, bare = { id: 'b', isChar: true }; let threw = false; try { I3.applyLightPreset(w, v, { id: 'm' }); I3.applyLightPreset(bare, v, { id: 'm' }); } catch (e) { threw = true; } return [v, threw, j(w.light), 'light' in bare]; });
        [null, undefined, 1, 0, {}, []].forEach(v => { const w = { id: 't', isChar: true, light: { bright: 20, dim: 40, unit: 'ft', name: 'Torch' } }; let threw = false; try { I3.applyLightPreset(w, v, { id: 'm' }); } catch (e) { threw = true; } odd.push([String(v), threw, j(w.light), false]); });
        check('light preset: only a place in the list written in digits picks a preset — a position past the list (the panel drawn before the list changed), a negative or fractional one, blanks, another way of writing a number, a prototype\'s name or anything that is no text copies nothing and saves nothing: the light keeps its radii, its unit and its name, a token with no light gains none, and the panel is drawn afresh',
            odd.every(r => r[1] === false && r[2] === j({ bright: 20, dim: 40, unit: 'ft', name: 'Torch' }) && r[3] === false) && I3.calls.saves === oddSaves && I3.calls.inspectors === oddInsp + 21 * 2 + 6, [odd, I3.calls.saves - oddSaves, I3.calls.inspectors - oddInsp]);
        const I4 = mkInsp({ id: 'c1', system: hostileSys() }, { count: FCl.LIMITS.lights }), fresh = { id: 'n', isChar: true }, freshSrc = { id: 'n2', type: 'light', light: { bright: 0, dim: 0 } }, lit = { id: 'l', isChar: true, light: { bright: 1, dim: 1 } };
        I4.applyLightPreset(fresh, '0', { id: 'm' }); I4.applyLightPreset(freshSrc, '0', { id: 'm' });
        const refusedCalls = j(I4.calls); I4.applyLightPreset(lit, '0', { id: 'm' });
        const I5 = mkInsp({ id: 'c1', system: hostileSys() }, { count: FCl.LIMITS.lights - 1 }), under = { id: 'u', isChar: true }; I5.applyLightPreset(under, '0', { id: 'm' });
        check('light preset: a new light past the map\'s cap is refused with a toast and no save (the block drawn again); a light the map already counts may still change; one under the cap comes in',
            !('light' in fresh) && j(freshSrc.light) === j({ bright: 0, dim: 0 }) && refusedCalls === j({ toasts: [I4.calls.toasts[0], I4.calls.toasts[0]], saves: 0, renders: 0, inspectors: 2, vision: 0 }) && /most light sources it can hold \(200\)/.test(I4.calls.toasts[0] || '')
            && j(lit.light) === j({ bright: 5, dim: 10, name: T }) && I4.calls.saves === 1 && I4.calls.toasts.length === 2 && j(under.light) === j({ bright: 5, dim: 10, name: T }) && I5.calls.toasts.length === 0, [refusedCalls, lit.light, under.light]);
        const I6 = mkInsp({ id: 'c1', system: hostileSys() }), srcNone = { id: 's', type: 'light', light: { bright: 0, dim: 0, name: 'Gone' } }, tokNone = { id: 't', isChar: true, light: { bright: 0, dim: 0, name: 'Gone' } }, srcJunk = { id: 's2', type: 'light', light: T };
        I6.applyLightPreset(srcNone, '', { id: 'm' }); I6.applyLightPreset(tokNone, '', { id: 'm' }); I6.applyLightPreset(srcJunk, '', { id: 'm' });
        const I7 = mkInsp({ id: 'c1', system: hostileSys() }, { noCore: true }), tokKeep = { id: 't', isChar: true, light: { bright: 1, dim: 2 } }; I7.applyLightPreset(tokKeep, '0', { id: 'm' });
        check('light preset: a light source with no light left reads { bright: 0, dim: 0 } and a token loses the key; with no cleaner on hand nothing changes and nothing is saved',
            j(srcNone.light) === j({ bright: 0, dim: 0 }) && !('light' in tokNone) && j(srcJunk.light) === j({ bright: 0, dim: 0 }) && I6.calls.saves === 3 && j(tokKeep.light) === j({ bright: 1, dim: 2 }) && I7.calls.saves === 0 && I7.calls.renders === 0 && throwsNot(function() { I6.applyLightPreset(null, '0', { id: 'm' }); }), [srcNone, tokNone, srcJunk, tokKeep]);
        check('light block (inspector.js): the Light block is built by lightFieldHtml from the cleaned light and the system\'s presets, a preset picked goes through applyLightPreset, and a radius set by hand reads the unit select',
            /var L = window\.wpFogCore && window\.wpFogCore\.cleanLight \? window\.wpFogCore\.cleanLight\(w\.light\) : null;\n\s*return lightFieldHtml\(w, L, lightPresetsNow\(\)\);/.test(inspL)
            && /if \(_el_wbLP\) _el_wbLP\.addEventListener\('change', function\(\) \{ applyLightPreset\(w, this\.value, activeMap\); \}\);/.test(inspL) && /unit: _el_wbLU \? _el_wbLU\.value : old \? old\.unit : ''/.test(inspL));

        // the ruler's line, a target mark's tag and the caption (whiteboard.js), run for real
        const mkLabel = (win, camp) => new Function('esc', 'window', 'getActiveCampaign', "'use strict';\n" + slice('whiteboard.js', 'lightlabel') + '\nreturn { litViewer: litViewer, lightSeenBy: lightSeenBy, rulerLightText: rulerLightText, TARGET_LIGHT_GLYPH: TARGET_LIGHT_GLYPH, targetLightHtml: targetLightHtml, targetLightCaption: targetLightCaption };')(SC.esc, win, () => camp || null);
        const LB = mkLabel({});
        const rT = LB.rulerLightText(10, 20, { lv: 1, name: T }), rP = LB.rulerLightText(1, 2, { lv: 0, name: P + '</text><a href="' + U + '">x</a>' });
        check('ruler light: a hostile level name lands escaped inside its <text>, whole; no name, no line', rT === '<text x="10" y="20">' + SC.esc(T) + '</text>' && risks(rT).length === 0 && risks(rP).length === 0 && rP.split('<').length === 3 && rP.indexOf('<a') < 0
            && LB.rulerLightText(1, 2, null) === '' && LB.rulerLightText(1, 2, { lv: 1, name: '' }) === '' && LB.rulerLightText(1, 2, { lv: 1 }) === '', [rT, rP]);
        const MK = '<span class="target-mark target-mark-ini" title="Ana" style="background:hsl(10,75%,55%);">A</span>';
        const tDark = LB.targetLightHtml(MK, { lv: 0, name: P }), tDim = LB.targetLightHtml(MK, { lv: 1, name: T }), tOdd = LB.targetLightHtml(MK, { lv: T, name: 'n' }), tProto = LB.targetLightHtml(MK, { lv: '__proto__', name: 'n' });
        check('target light: the level\'s name is escaped in the tag\'s title and the tag holds only its own two glyphs, whatever the level reads; no light leaves the mark as it was',
            tDark === '<span class="target-pair">' + MK + '<span class="target-light dark" title="' + SC.esc(P) + '">●</span></span>' && tDim === '<span class="target-pair">' + MK + '<span class="target-light" title="' + SC.esc(T) + '">☽</span></span>'
            && tOdd === '<span class="target-pair">' + MK + '<span class="target-light" title="n">☽</span></span>' && tProto === tOdd && [tDark, tDim, tOdd].every(h => risks(h).length === 0) && LB.targetLightHtml(MK, null) === MK && LB.targetLightHtml(MK, undefined) === MK
            && j(LB.TARGET_LIGHT_GLYPH) === j(['●', '☽']), [tDark, tDim, tOdd]);
        check('target light: the caption is plain text — each name once, in order, joined by a middle dot; anything that is not a named light is skipped',
            LB.targetLightCaption([{ lv: 1, name: T }, null, { lv: 1, name: T }, { lv: 0, name: 'Darkness (-9)' }, { lv: 0, name: 5 }, { lv: 0, name: '' }, 'x', { lv: 1, name: '__proto__' }, { lv: 1, name: 'constructor' }]) === T + ' · Darkness (-9) · __proto__ · constructor'
            && LB.targetLightCaption([]) === '' && LB.targetLightCaption(null) === '' && LB.targetLightCaption('names') === '' && LB.targetLightCaption([null, null]) === '');
        // whose eyes a screen may read through, and the name from the system as cleaned
        const sysN = { combat: { light: { names: { dim: '  ' + T + '  ', dark: 'D'.repeat(200) } } } }, seenLog = [];
        const winOf = (netL, lv, sys) => ({ wpNet: netL, wpFog: { lightSeen: (a, b, m, c) => { seenLog.push([a.id, b.id, m && m.id, c && c.id]); return lv; } }, wpSystemCore: SYl, wpSheets: { systemOf: () => sys } });
        const mine = { id: 'mine', ownerId: 'pA' }, theirs = { id: 'theirs', ownerId: 'pB' }, far = { id: 'far' }, mapL = { id: 'mL' }, campS = { id: 'cS' };
        const gmDim = mkLabel(winOf(null, 1, sysN), campS).lightSeenBy(theirs, far, mapL), hostDark = mkLabel(winOf({ active: true, role: 'host', myId: 'pH' }, 0, sysN), campS).lightSeenBy(theirs, far, mapL);
        const nSeenGm = seenLog.length, clientOther = mkLabel(winOf({ active: true, role: 'client', myId: 'pA' }, 1, sysN), campS).lightSeenBy(theirs, far, mapL), nSeenOther = seenLog.length, clientMine = mkLabel(winOf({ active: true, role: 'client', myId: 'pA' }, 1, sysN), campS).lightSeenBy(mine, far, mapL);
        check('light seen: the GM\'s screen reads through any token, a player\'s only through a token of their own (another\'s is never even worked out); the name is the system\'s, cleaned and cut',
            j(gmDim) === j({ lv: 1, name: T }) && j(hostDark) === j({ lv: 0, name: 'D'.repeat(SYl.LIMITS.label) }) && j(seenLog[0]) === j(['theirs', 'far', 'mL', 'cS']) && nSeenGm === 2 && clientOther === null && nSeenOther === nSeenGm && j(clientMine) === j({ lv: 1, name: T }), [gmDim, hostDark, clientOther, clientMine, seenLog]);
        check('light seen: bright or clear sight, no answer, a level the system gives no name, or a missing token shows nothing',
            [2, null, undefined, 3, '1', true].every(lv => mkLabel(winOf(null, lv, sysN), campS).lightSeenBy(mine, far, mapL) === null) && mkLabel(winOf(null, 0, { combat: { light: { names: { dim: 'Dim' } } } }), campS).lightSeenBy(mine, far, mapL) === null
            && mkLabel(winOf(null, 1, null), campS).lightSeenBy(mine, far, mapL) === null && mkLabel(winOf(null, 1, sysN), campS).lightSeenBy(null, far, mapL) === null && mkLabel(winOf(null, 1, sysN), campS).lightSeenBy(mine, null, mapL) === null && mkLabel({}, campS).lightSeenBy(mine, far, mapL) === null);
        check('ruler light (whiteboard.js): the ruler adds the line through rulerLightText (the name never joined raw), a target mark through targetLightHtml, and the caption under a token is handed to the fog\'s overlay as a mark on the token (a data attribute), which draws it as text on its canvas (fillText), never as markup',
            /if \(litR\) html \+= rulerLightText\(mx \+ 8, _covY \+ \(labCov \? 19 : 0\), litR\);/.test(wbL) && !/litR\.name/.test(wbL) && /\}\)\.map\(function\(mkH, ti\) \{ return targetLightHtml\(mkH, tlit\[ti\]\); \}\)\.map\(function\(mkH, ti\) \{ return targetHeightHtml\(mkH, thgt\[ti\]\); \}\)\.join\(''\);/.test(wbL)
            && /capT = tgs\.length \? targetLightCaption\(tlit\) : '';/.test(wbL) && /if \(capT\) \{ if \(el\.dataset\.lightCap !== capT\) el\.dataset\.lightCap = capT; \}\n\s*else if \(el\.dataset\.lightCap !== undefined\) delete el\.dataset\.lightCap;/.test(wbL) && !/lightCap[^\n]*innerHTML|innerHTML[^\n]*capT/.test(wbL)
            && (() => { const fg = fs.readFileSync(path.join(dir, 'fog.js'), 'utf8').replace(/\r\n/g, '\n'), a = fg.indexOf('function drawCaptions('), dc = a >= 0 ? fg.slice(a, fg.indexOf('\n}\n', a)) : ''; return /ctx\.fillText\(t, cx, cy \+ 0\.5, 346\);/.test(dc) && /var t = String\(els\[i\]\.dataset\.lightCap \|\| ''\)\.slice\(0, 200\);/.test(dc) && !/innerHTML|insertAdjacentHTML|outerHTML|createElement/.test(dc); })() && (wbL.match(/targetLightCaption\(/g) || []).length === 2 && (wbL.match(/rulerLightText\(/g) || []).length === 2);
        const tipLine = wbL.slice(wbL.indexOf('var lgU = '), wbL.indexOf('\n', wbL.indexOf('var lgU = '))), tipSrc = fs.readFileSync(path.join(dir, 'tooltips.js'), 'utf8').replace(/\r\n/g, '\n');
        check('light marker: its tooltip (the preset\'s name and the unit) is built from the cleaned light and set through dataset.tip, which the tooltip shows as text — never markup',
            /^var lgU = lgL && lgL\.unit \? lgL\.unit : 'yd', lgT = 'Light source' \+ \(lgL && lgL\.name \? ' \(' \+ lgL\.name \+ '\)' : ''\) \+ /.test(tipLine) && /var lgL = window\.wpFogCore && window\.wpFogCore\.cleanLight \? window\.wpFogCore\.cleanLight\(item\.light\) : null;/.test(wbL)
            && /\n\s*if \(el\.dataset\.tip !== lgT\) el\.dataset\.tip = lgT;\n/.test(wbL) && !/innerHTML[^\n]*lgT|lgT[^\n]*innerHTML/.test(wbL) && /return el\.dataset\.tip \|\| '';/.test(tipSrc) && /t\.textContent = text;/.test(tipSrc) && !/innerHTML/.test(tipSrc), tipLine);

        // the Combat card's Light box (sheets.js lightBox), run for real on a page that records every node and any use of innerHTML
        const shL = read('sheets.js'), boxSrc = slice('sheets.js', 'lightbox');
        const lineAt = k => { const i = shL.indexOf('\n' + k); if (i < 0) throw new Error('sinkcheck: sheets.js ' + k + ' not found'); return shL.slice(i + 1, shL.indexOf('\n', i + 1)); };
        const mkBox = (draft0, errs) => {
            const made = [], htmlSet = [], calls = { dirty: 0, patched: 0, all: 0, toasts: [] };
            const fake = tag => { const e = { tag, children: [], childNodes: [], style: {}, dataset: {}, className: '', textContent: '', appendChild(k) { this.children.push(k); this.childNodes.push(k); return k; }, addEventListener() {} }; ['innerHTML', 'outerHTML'].forEach(p => Object.defineProperty(e, p, { set(v) { htmlSet.push(v); }, get() { return ''; } })); e.insertAdjacentHTML = (w, v) => { htmlSet.push(v); }; made.push(e); return e; };
            const doc = { createElement: fake, createTextNode: t => { const n = { tag: '#text', textContent: String(t) }; made.push(n); return n; } };
            const env = { draft: draft0, document: doc, LIMITS: SYl.LIMITS, LIGHT_UNITS: SYl.LIGHT_UNITS, markDirty: () => { calls.dirty++; }, patchErrors: () => { calls.patched++; }, renderAll: () => { calls.all++; }, toast: m => calls.toasts.push(m), errs: errs || [] };
            const api = new Function('env', "'use strict';\nvar draft = env.draft, document = env.document, LIMITS = env.LIMITS, LIGHT_UNITS = env.LIGHT_UNITS, markDirty = env.markDirty, patchErrors = env.patchErrors, renderAll = env.renderAll, toast = env.toast;\n"
                + lineAt('function el(tag, cls, text) {') + '\n' + lineAt('function opt(value, text, selected) {') + '\n' + lineAt('function input(cls, value, title, placeholder) {') + '\n' + lineAt('function select(cls, options, value, title) {') + '\n'
                + "function errorCell(id) { var cell = el('div', 'sys-err'); env.errs.forEach(function(m) { cell.appendChild(el('div', 'sys-err-line', m)); }); return cell; }\n"
                + boxSrc + '\nreturn { lightDraft: lightDraft, lightBox: lightBox, onLightInput: onLightInput, onLightChange: onLightChange, lightClick: lightClick, draft: function() { return draft; } };')(env);
            api.made = made; api.htmlSet = htmlSet; api.calls = calls; api.fake = fake; return api;
        };
        const byCls = (B, c) => B.made.filter(e => typeof e.className === 'string' && e.className.split(' ').indexOf(c) >= 0);
        const inherited = Object.create({ dim: 'Inherited dim', dark: 'Inherited dark' });
        const cmH = { light: { names: { dim: T, dark: P }, presets: [{ name: T, bright: 5, dim: 10, unit: P, pick: 'yes' }, { name: P, bright: '<b>', dim: 3, unit: 'ft', pick: true }, null, { name: 7, bright: 1, dim: 1, unit: 'constructor' }] } };
        const B1 = mkBox({ combat: cmH }, [T]), root1 = B1.fake('div'); B1.lightBox(root1, cmH);
        const names1 = byCls(B1, 'sys-light-name'), pn1 = byCls(B1, 'sys-light-pname'), pb1 = byCls(B1, 'sys-light-pbright'), pd1 = byCls(B1, 'sys-light-pdim'), pu1 = byCls(B1, 'sys-light-punit'), pp1 = byCls(B1, 'sys-light-ppick'), rows1 = byCls(B1, 'sys-light-row');
        const texts1 = B1.made.map(e => e.textContent).filter(Boolean);
        check('light box: the sliced source writes no markup (no innerHTML, insertAdjacentHTML or outerHTML) and the page helpers it runs on are the sheet\'s own text-only ones',
            !/innerHTML|insertAdjacentHTML|outerHTML/.test(boxSrc) && !/innerHTML|insertAdjacentHTML|outerHTML/.test(lineAt('function el(tag, cls, text) {') + lineAt('function opt(value, text, selected) {') + lineAt('function input(cls, value, title, placeholder) {') + lineAt('function select(cls, options, value, title) {')));
        check('light box: hostile level names and preset names arrive as input values, what Save would drop as a text node, and nothing is written through innerHTML',
            B1.htmlSet.length === 0 && root1.children.length === 1 && root1.children[0].className === 'sys-light' && j(names1.map(i => [i.dataset.lvl, i.value, i.type, i.maxLength])) === j([['dim', T, 'text', SYl.LIMITS.label], ['dark', P, 'text', SYl.LIMITS.label]])
            && j(pn1.map(i => i.value)) === j([T, P, '', '']) && pn1.every(i => i.type === 'text' && i.maxLength === SYl.LIMITS.label) && texts1.indexOf(T) >= 0 && B1.made.every(e => e.tag !== 'script' && e.tag !== 'img' && e.tag !== 'a'), j([B1.htmlSet, names1.map(i => i.value), pn1.map(i => i.value)]));
        check('light box: a preset\'s radii show only when they are numbers, its unit only when the app knows it (yards otherwise), "players may pick" only when it is true; each row keeps its place in the list',
            j(pb1.map(i => i.value)) === j(['5', '', '', '1']) && j(pd1.map(i => i.value)) === j(['10', '3', '', '1']) && pb1.concat(pd1).every(i => i.type === 'number') && j(pu1.map(s => s.children.map(o => o.value).join())) === j(['yd,ft,m,cells', 'yd,ft,m,cells', 'yd,ft,m,cells', 'yd,ft,m,cells'])
            && j(pu1.map(s => s.children.filter(o => o.selected).map(o => o.value).join())) === j(['yd', 'ft', 'yd', 'yd']) && j(pp1.map(c => [c.type, c.checked])) === j([['checkbox', false], ['checkbox', true], ['checkbox', false], ['checkbox', false]]) && j(rows1.map(r => r.dataset.li)) === j(['0', '1', '2', '3']), j([pb1.map(i => i.value), pd1.map(i => i.value), pu1.map(s => s.children.filter(o => o.selected).map(o => o.value)), pp1.map(c => c.checked)]));
        const cmI = { light: { names: inherited, presets: 'junk' } }, B2 = mkBox({ combat: cmI }), root2 = B2.fake('div'); B2.lightBox(root2, cmI);
        const cmN = {}, B3 = mkBox({ combat: cmN }), root3 = B3.fake('div'); B3.lightBox(root3, cmN);
        const cmA = { light: [T] }, B3a = mkBox({ combat: cmA }), root3a = B3a.fake('div');
        check('light box: a level name is read by its own key (an inherited one shows empty), a name that is not text shows empty, and a system with no light rules (or rules that are not an object) shows the empty box without a crash',
            j(byCls(B2, 'sys-light-name').map(i => i.value)) === j(['', '']) && byCls(B2, 'sys-light-row').length === 0 && j(byCls(B3, 'sys-light-name').map(i => i.value)) === j(['', '']) && byCls(B3, 'sys-light-row').length === 0 && !('light' in cmN) && byCls(B3, 'sys-light-add')[0].disabled === false
            && throwsNot(function() { B3a.lightBox(root3a, cmA); }) && byCls(B3a, 'sys-light-row').length === 0 && j(byCls(mkBoxNames({ dim: 5, dark: { a: 1 } }), 'sys-light-name').map(i => i.value)) === j(['', '']));
        function mkBoxNames(nm) { const cm = { light: { names: nm } }, B = mkBox({ combat: cm }); B.lightBox(B.fake('div'), cm); return B; }
        const full = []; for (let i = 0; i < SYl.LIMITS.lightPresets; i++) full.push({ name: 'L' + i, bright: 1, dim: 2 });
        const cmF = { light: { presets: full } }, B4 = mkBox({ combat: cmF }), root4 = B4.fake('div'); B4.lightBox(root4, cmF);
        const rowOf = i => ({ dataset: { li: String(i) } }), btn = (act, i) => ({ dataset: { act: act }, closest: () => i === undefined ? null : rowOf(i) }), fld = (cls, i, more) => Object.assign({ className: cls, dataset: {}, closest: () => i === undefined ? null : rowOf(i) }, more);
        const addFull = B4.lightClick(btn('lpadd'));
        check('light box: at the most presets a system holds the add button is off and a click adds none (a toast says so)', byCls(B4, 'sys-light-add')[0].disabled === true && addFull === true && full.length === SYl.LIMITS.lightPresets && B4.calls.toasts.length === 1 && B4.calls.dirty === 0 && B4.calls.all === 0 && byCls(B4, 'sys-light-row').length === SYl.LIMITS.lightPresets, [full.length, B4.calls]);
        const dE = { combat: { blastAuto: 'full', blastRoller: 'owner', hpResource: '', light: { presets: [{ name: 'A', bright: 1, dim: 2 }, { name: 'B', bright: 3, dim: 4, unit: 'ft', pick: true }, { name: 'C', bright: 5, dim: 6 }] } } }, B5 = mkBox(dE), ps = () => dE.combat.light.presets;
        const order = () => ps().map(p => p.name).join('');
        B5.lightClick(btn('lpup', 2)); const o1 = order(); B5.lightClick(btn('lpdown', 0)); const o2 = order(); B5.lightClick(btn('lpup', 0)); B5.lightClick(btn('lpdown', 2)); const o3 = order(); B5.lightClick(btn('lpdel', 1)); const o4 = order();
        ['-1', '7', '__proto__', 'length', 'x'].forEach(i => { B5.lightClick(btn('lpdel', i)); B5.lightClick(btn('lpup', i)); B5.lightClick(btn('lpdown', i)); }); const o5 = order(), allBefore = B5.calls.all;
        B5.lightClick(btn('lpadd')); const added = j(ps()[ps().length - 1]);
        check('light box: the row buttons move and remove the preset of their own row only (a row that is not in the list does nothing); a new preset starts with no name; any other button is not the Light box\'s',
            o1 === 'ACB' && o2 === 'CAB' && o3 === 'CAB' && o4 === 'CB' && o5 === 'CB' && added === j({ name: '', bright: 5, dim: 10 }) && B5.calls.all === allBefore + 1 && B5.lightClick(btn('tadd')) === false && B5.lightClick(btn('lpdelx', 0)) === false && B5.lightClick({ dataset: {} }) === false && order() === 'CB', [o1, o2, o3, o4, o5, added]);
        const dI = { combat: { blastAuto: 'full', blastRoller: 'owner', hpResource: '', light: { names: { dim: 'Dim' }, presets: [{ name: 'A', bright: 1, dim: 2, unit: 'ft', pick: true }] } } }, B6 = mkBox(dI), p0 = () => dI.combat.light.presets[0], long = T + 'x'.repeat(200);
        const rIn = [B6.onLightInput(fld('sys-light-name field', undefined, { value: long, dataset: { lvl: T } })), B6.onLightInput(fld('sys-light-name field', undefined, { value: P, dataset: { lvl: 'dark' } })), B6.onLightInput(fld('sys-light-pname field', 0, { value: long })), B6.onLightInput(fld('field sys-light-pbright', 0, { value: '7.5' })), B6.onLightInput(fld('field sys-light-pdim', 0, { value: '1" onfocus="x' })), B6.onLightInput(fld('sys-key field', 0, { value: 'x' })), B6.onLightInput(fld('sys-light-pname field', '__proto__', { value: 'x' })), B6.onLightInput(fld('sys-light-pname field', 5, { value: 'x' }))];
        const afterIn = j(dI.combat.light);
        const rCh = [B6.onLightChange(fld('sys-light-punit', 0, { value: P })), j(p0()), B6.onLightChange(fld('sys-light-punit', 0, { value: 'cells' })), p0().unit, B6.onLightChange(fld('sys-light-punit', 0, { value: 'constructor' })), 'unit' in p0(), B6.onLightChange(fld('sys-light-ppick', 0, { checked: false })), 'pick' in p0(), B6.onLightChange(fld('sys-light-ppick', 0, { checked: true })), p0().pick, B6.onLightChange(fld('sys-combat-auto', 0, { value: 'x' })), B6.onLightChange(fld('sys-light-punit', 9, { value: 'ft' }))];
        B6.onLightInput(fld('sys-light-name field', undefined, { value: '  ', dataset: { lvl: 'dim' } })); B6.onLightInput(fld('sys-light-name field', undefined, { value: '', dataset: { lvl: 'dark' } }));
        check('light box: what is typed is kept as text cut to the label\'s length, a level other than dark is dim, a radius only when it is a number, a unit only one the app knows, "players may pick" only as true; an emptied name goes; a box of another card is not the Light box\'s',
            j(rIn) === j([true, true, true, true, true, false, true, true]) && afterIn === j({ names: { dim: long.slice(0, SYl.LIMITS.label), dark: P }, presets: [{ name: long.slice(0, SYl.LIMITS.label), bright: 7.5, unit: 'ft', pick: true }] })
            && j(rCh) === j([true, j({ name: long.slice(0, SYl.LIMITS.label), bright: 7.5, pick: true }), true, 'cells', true, false, true, false, true, true, false, true]) && !('names' in dI.combat.light) && B6.htmlSet.length === 0 && dI.combat.light.presets.length === 1, [rIn, afterIn, rCh, dI.combat.light]);
        const savedL = SYl.cleanLightRules(JSON.parse(afterIn)), dNew = {}, B7 = mkBox(dNew), made7 = B7.lightDraft();
        check('light box: what the box keeps, Save cleans (a preset with a bright radius alone takes it as its dim edge); a draft with no combat rules gains them with its light rules, a light that is not an object is replaced',
            j(savedL) === j({ names: { dim: long.slice(0, SYl.LIMITS.label), dark: P }, presets: [{ name: long.slice(0, SYl.LIMITS.label), bright: 7.5, dim: 7.5, unit: 'ft', pick: true }] }) && j(dNew) === j({ combat: { blastAuto: 'full', blastRoller: 'owner', hpResource: '', light: {} } }) && made7 === dNew.combat.light
            && j(mkBox({ combat: { light: [1] } }).lightDraft()) === '{}' && j(mkBox({ combat: { light: T } }).lightDraft()) === '{}', [savedL, dNew]);
        // senses S2a: the Combat card's Senses box (sheets.js sensesBox), run for real on the same kind of page, over the real secret set
        const FOs = await import(modUrl('formula.js')), snSrc = slice('sheets.js', 'sensesbox');
        const mkSn = (draft0, errs) => {
            const made = [], htmlSet = [], calls = { dirty: 0, patched: 0, all: 0, toasts: [] }; let idN = 0;
            const fake = tag => { const e = { tag, children: [], childNodes: [], style: {}, dataset: {}, className: '', textContent: '', appendChild(k) { this.children.push(k); this.childNodes.push(k); return k; }, addEventListener() {} }; ['innerHTML', 'outerHTML'].forEach(p => Object.defineProperty(e, p, { set(v) { htmlSet.push(v); }, get() { return ''; } })); e.insertAdjacentHTML = (w, v) => { htmlSet.push(v); }; made.push(e); return e; };
            const doc = { createElement: fake, createTextNode: t => { const n = { tag: '#text', textContent: String(t) }; made.push(n); return n; } };
            const env = { draft: draft0, document: doc, LIMITS: SYl.LIMITS, LIGHT_UNITS: SYl.LIGHT_UNITS, markDirty: () => { calls.dirty++; }, patchErrors: () => { calls.patched++; }, renderAll: () => { calls.all++; }, toast: m => calls.toasts.push(m), errs: errs || [], uid: p => { const k = idN++; return k === 0 ? p + 'x' : k === 1 ? p + 'aaaaaaaa' : p + ('abcdefgh' + k).slice(-8); }, F: () => FOs, secretFieldIds: SYl.secretFieldIds, gmViewFields: SYl.gmViewFields };   // the first ids uid gives are too short, then one already taken, as a random one can be
            const api = new Function('env', "'use strict';\nvar draft = env.draft, document = env.document, LIMITS = env.LIMITS, LIGHT_UNITS = env.LIGHT_UNITS, markDirty = env.markDirty, patchErrors = env.patchErrors, renderAll = env.renderAll, toast = env.toast, uid = env.uid, F = env.F, secretFieldIds = env.secretFieldIds, gmViewFields = env.gmViewFields;\n"
                + lineAt('function el(tag, cls, text) {') + '\n' + lineAt('function opt(value, text, selected) {') + '\n' + lineAt('function input(cls, value, title, placeholder) {') + '\n' + lineAt('function select(cls, options, value, title) {') + '\n'
                + "function errorCell(id) { var cell = el('div', 'sys-err'); env.errs.forEach(function(m) { cell.appendChild(el('div', 'sys-err-line', m)); }); return cell; }\n"
                + snSrc + '\nreturn { sensesDraft: sensesDraft, sensesBox: sensesBox, senseSentence: senseSentence, blindSentence: blindSentence, onSensesInput: onSensesInput, onSensesChange: onSensesChange, sensesClick: sensesClick, senseUnitFor: senseUnitFor, draft: function() { return draft; } };')(env);
            api.made = made; api.htmlSet = htmlSet; api.calls = calls; api.fake = fake; return api;
        };
        const snFields = () => [{ id: 'f_keen', key: 'Keen', label: T, kind: 'number', vis: 'all', edit: 'owner', def: 0 }, { id: 'f_gm', key: 'Secret', label: P, kind: 'number', vis: 'gm', def: 3 }, { id: 'f_der', key: 'Derived', label: 'Derived', kind: 'formula', vis: 'all', formula: 'Secret + 1' }, { id: 'f_note', key: 'Note', label: 'Note', kind: 'text', vis: 'all' }];
        const snList = () => [{ id: 'sn_aaaaaaaa', name: T, range: { by: 'field', field: 'f_keen' }, unit: 'ft', grade: 'full', walls: 'pass', arc: 'all' }, { id: 'sn_bbbbbbbb', name: P, range: { by: 'n', n: 70 }, unit: 'cells', grade: 'full', shows: 'dim' }, { id: 'sn_cccccccc', name: 'Hidden', range: { by: 'field', field: 'f_gm' }, grade: 'full' }, { id: 'sn_dddddddd', name: 'Gone', range: { by: 'field', field: 'f_gone' }, unit: '?', grade: 'full' }, null, { id: 'sn_eeeeeeee', name: 7, range: 'x', unit: 'constructor', grade: 'full', arc: 'front', walls: 'block', shows: 'bright' }, { id: 'sn_ffffffff', name: 'Text n', range: { by: 'n', n: '7' }, grade: 'full' }];
        const snD1 = { fields: snFields(), combat: { senses: { list: snList() } } }, S1b = mkSn(snD1, [T]), sRoot = S1b.fake('div'); S1b.sensesBox(sRoot, snD1.combat);
        const sCls = c => byCls(S1b, c), sayT = sCls('sys-sense-says').map(e => e.textContent);
        check('senses box: the sliced source writes no markup (no innerHTML, insertAdjacentHTML or outerHTML) and runs on the sheet\'s own text-only page helpers',
            !/innerHTML|insertAdjacentHTML|outerHTML/.test(snSrc) && S1b.htmlSet.length === 0 && sRoot.children.length === 1 && sRoot.children[0].className === 'sys-light sys-senses' && S1b.made.every(e => e.tag !== 'script' && e.tag !== 'img' && e.tag !== 'a'));
        check('senses box: hostile sense names are input values cut to the label, hostile field labels reach the range list and the row\'s sentence as text only; what Save would drop is a text node',
            j(sCls('sys-sense-name').map(i => [i.value, i.type, i.maxLength])) === j([[T, 'text', SYl.LIMITS.label], [P, 'text', SYl.LIMITS.label], ['Hidden', 'text', SYl.LIMITS.label], ['Gone', 'text', SYl.LIMITS.label], ['', 'text', SYl.LIMITS.label], ['', 'text', SYl.LIMITS.label], ['Text n', 'text', SYl.LIMITS.label]])
            && sCls('sys-sense-from')[0].children.some(o => o.value === 'f_keen' && o.textContent === 'From ' + T) && sCls('sys-sense-from')[0].children.some(o => o.value === 'f_gm' && o.textContent === 'From ' + P)
            && sayT[0].indexOf(T) > 0 && sayT[2].indexOf(P) > 0 && S1b.made.some(e => e.textContent === T && e.className === 'sys-err-line'), j([sCls('sys-sense-name').map(i => i.value), sayT]));
        check('senses box: each row shows its range source (a number box only for a number), its unit (a pick-a-unit choice only while it has none, yards for one the app does not know), its ticks (walls stop it unless it passes them, all round, dim) and keeps its place in the list',
            j(sCls('sys-sense-from').map(s => s.children.filter(o => o.selected).map(o => o.value).join())) === j(['f_keen', '#n', 'f_gm', 'f_gone', '#n', '#n', '#n']) && sCls('sys-sense-from')[3].children.some(o => o.value === 'f_gone' && o.textContent === 'From a field no longer here')
            && j(sCls('sys-sense-n').map(i => i.value)) === j(['70', '', '', '']) && j(sCls('sys-sense-unit').map(s => s.children.map(o => o.value).join())) === j(['yd,ft,m,cells', 'yd,ft,m,cells', 'yd,ft,m,cells', '?,yd,ft,m,cells', 'yd,ft,m,cells', 'yd,ft,m,cells', 'yd,ft,m,cells'])
            && j(sCls('sys-sense-unit').map(s => s.children.filter(o => o.selected).map(o => o.value).join())) === j(['ft', 'cells', 'yd', '?', 'yd', 'yd', 'yd'])
            && j(sCls('sys-sense-tick').map(c => c.dataset.tick + ':' + c.checked)) === j(['walls:false', 'arc:true', 'dim:false', 'eyes:false', 'veil:false', 'walls:true', 'arc:false', 'dim:true', 'eyes:false', 'veil:false', 'walls:true', 'arc:false', 'dim:false', 'eyes:false', 'veil:false', 'walls:true', 'arc:false', 'dim:false', 'eyes:false', 'veil:false', 'walls:true', 'arc:false', 'dim:false', 'eyes:false', 'veil:false', 'walls:true', 'arc:false', 'dim:false', 'eyes:false', 'veil:false', 'walls:true', 'arc:false', 'dim:false', 'eyes:false', 'veil:false'])
            && j(sCls('sys-sense-row').map(r => r.dataset.si)) === j(['0', '1', '2', '3', '4', '5', '6']), j([sCls('sys-sense-from').map(s => s.children.filter(o => o.selected).map(o => o.value)), sCls('sys-sense-unit').map(s => s.children.filter(o => o.selected).map(o => o.value))]));
        const sayOf = (s, flds) => S1b.senseSentence(s, flds || snFields().filter(f => f.kind !== 'text'), SYl.secretFieldIds({ fields: SYl.gmViewFields({ fields: snFields() }, FOs) }, FOs));
        const says = { field: sayOf({ range: { by: 'field', field: 'f_keen' }, unit: 'ft', walls: 'pass', arc: 'all' }), secret: sayOf({ range: { by: 'field', field: 'f_gm' } }), derived: sayOf({ range: { by: 'field', field: 'f_der' }, unit: 'm' }), gone: sayOf({ range: { by: 'field', field: 'f_gone' } }), zero: sayOf({ range: { by: 'n', n: 0 } }), far: sayOf({ range: { by: 'n', n: 70 }, unit: 'cells', shows: 'dim' }), wait: sayOf({ range: { by: 'n', n: 5 }, unit: '?' }), yards: sayOf({ range: { by: 'n', n: 5 } }), noSecret: S1b.senseSentence({ range: { by: 'field', field: 'f_keen' } }, snFields(), null) };
        check('senses box: each row\'s sentence says what it does — its reach, unit, walls and arc; that its owner can change a field of theirs; that Save drops one on a GM-only value or one worked out from one (or with the secret set unknown), or with no field; that 0 is no one but a token given a range of its own (senses S2b); the 60-cell cap; that it waits for a unit; dim or clear',
            says.field === 'Sees everything within the character\u2019s ' + T + ' (in feet), through walls, all round. A value of 0 or less: that character does not have it. Its owner can change this on their sheet. Seen clearly, light or none: no dim or dark name shows inside its range.'
            && /^Save drops this sense: its owner cannot read x" onmouseover/.test(says.secret) && /^Save drops this sense: its owner cannot read Derived/.test(says.derived) && says.gone === 'Pick where its range comes from: Save drops this sense.' && says.zero === 'A range of 0: no one has it unless a token is given a range of its own in its Properties.'
            && says.far === 'Sees everything within 70 grid cells. Every character has this sense. 60 cells is the most a sense reaches. What it sees in the dark it sees as dim.' && says.wait === 'Pick what its range counts in: Save leaves this sense out until you do.'
            && says.yards === 'Sees everything within 5 yards. Every character has this sense. Seen clearly, light or none: no dim or dark name shows inside its range.' && /^Save drops this sense/.test(says.noSecret), j(says));
        const sBtn = (act, i, tpl) => ({ dataset: { act: act, tpl: tpl }, closest: () => i === undefined ? null : { dataset: { si: String(i) } } }), sFld = (cls, i, more) => Object.assign({ className: cls, dataset: {}, closest: () => i === undefined ? null : { dataset: { si: String(i) } } }, more);
        const dS = { fields: snFields(), combat: { light: { presets: [{ name: 'Torch', bright: 1, dim: 2, unit: 'ft' }] }, senses: { list: [{ id: 'sn_aaaaaaaa', name: 'A', range: { by: 'n', n: 1 }, grade: 'full' }, { id: 'sn_bbbbbbbb', name: 'B', range: { by: 'n', n: 2 }, grade: 'full' }, { id: 'sn_cccccccc', name: 'C', range: { by: 'n', n: 3 }, grade: 'full' }] } } }, S2 = mkSn(dS), sOrd = () => dS.combat.senses.list.map(s => s.name).join('');
        S2.sensesClick(sBtn('snup', 2)); const so1 = sOrd(); S2.sensesClick(sBtn('sndown', 0)); const so2 = sOrd(); S2.sensesClick(sBtn('sndel', 1)); const so3 = sOrd();
        ['-1', '9', '__proto__', 'length', 'x'].forEach(i => { S2.sensesClick(sBtn('sndel', i)); S2.sensesClick(sBtn('snup', i)); }); const so4 = sOrd();
        S2.sensesClick(sBtn('snadd', undefined, 'dark')); S2.sensesClick(sBtn('snadd', undefined, 'custom')); const adds = dS.combat.senses.list.slice(-2);
        const noLight = { fields: [], combat: {} }, S3b = mkSn(noLight), u0 = S3b.senseUnitFor(); S3b.sensesClick(sBtn('snadd', undefined, 'custom')); const pending = noLight.combat.senses.list[0];
        const yardsLight = { fields: [], combat: { light: { presets: [{ name: 'Glow', bright: 1, dim: 2 }] } } }, S3c = mkSn(yardsLight); S3c.sensesClick(sBtn('snadd', undefined, 'custom')); const yardsRow = yardsLight.combat.senses.list[0];
        check('senses box: the row buttons move and remove their own row only; a new sense has an id of the cleaner\'s pattern, a full grade, a range of 0 and the unit of the system\'s first light (feet here, yards stored as none), else none yet (it waits for one); Sees without light starts a dim one; other buttons are not the box\'s',
            so1 === 'ACB' && so2 === 'CAB' && so3 === 'CB' && so4 === 'CB' && adds.every(a => /^sn_[a-z0-9]{8}$/.test(a.id) && a.grade === 'full' && j(a.range) === j({ by: 'n', n: 0 }) && a.unit === 'ft') && adds[0].name === 'Sees in the dark' && adds[0].shows === 'dim' && adds[1].name === '' && !('shows' in adds[1])
            && u0 === '?' && pending.unit === '?' && !('unit' in yardsRow) && S2.sensesClick(sBtn('lpadd')) === false && S2.sensesClick({ dataset: {} }) === false && new Set(dS.combat.senses.list.map(s => s.id)).size === dS.combat.senses.list.length, j([so1, so2, so3, so4, adds, pending, yardsRow]));
        const fullS = { fields: [], combat: { senses: { list: Array.from({ length: SYl.LIMITS.senses }, (_, i) => ({ id: 'sn_full000' + i, name: 'S' + i, range: { by: 'n', n: 1 }, grade: 'full' })) } } }, S4 = mkSn(fullS), r4 = S4.fake('div'); S4.sensesBox(r4, fullS.combat); const addFullS = S4.sensesClick(sBtn('snadd', undefined, 'custom'));
        check('senses box: at the most senses a system holds the add buttons are off and a click adds none (a toast says so)', byCls(S4, 'sys-light-add').every(b => b.disabled === true) && byCls(S4, 'sys-light-add').length === 7 && addFullS === true && fullS.combat.senses.list.length === SYl.LIMITS.senses && S4.calls.toasts.length === 1 && S4.calls.all === 0, j(S4.calls));
        const dH = { fields: snFields(), combat: { senses: { list: [{ id: 'sn_aaaaaaaa', name: 'A', range: { by: 'n', n: 5 }, unit: '?', grade: 'full' }] } } }, S5 = mkSn(dH), h0 = () => dH.combat.senses.list[0], longS = T + 'x'.repeat(200);
        const hIn = [S5.onSensesInput(sFld('sys-sense-name field', 0, { value: longS })), S5.onSensesInput(sFld('field sys-sense-n', 0, { value: '12.5' })), j(h0().range), S5.onSensesInput(sFld('field sys-sense-n', 0, { value: '1" onfocus="x' })), 'n' in h0().range, S5.onSensesInput(sFld('sys-light-pname field', 0, { value: 'x' })), S5.onSensesInput(sFld('sys-sense-name field', '__proto__', { value: 'x' })), S5.onSensesInput(sFld('sys-sense-name field', 3, { value: 'x' }))];
        const hCh = [S5.onSensesChange(sFld('sys-sense-unit', 0, { value: P })), h0().unit, S5.onSensesChange(sFld('sys-sense-unit', 0, { value: 'm' })), h0().unit, S5.senseUnitFor(), S5.onSensesChange(sFld('sys-sense-unit', 0, { value: 'yd' })), 'unit' in h0(), S5.senseUnitFor(),
            S5.onSensesChange(sFld('sys-sense-tick', 0, { dataset: { tick: 'walls' }, checked: false })), h0().walls, S5.onSensesChange(sFld('sys-sense-tick', 0, { dataset: { tick: 'walls' }, checked: true })), 'walls' in h0(), S5.onSensesChange(sFld('sys-sense-tick', 0, { dataset: { tick: 'arc' }, checked: true })), h0().arc, S5.onSensesChange(sFld('sys-sense-tick', 0, { dataset: { tick: 'dim' }, checked: true })), h0().shows,
            S5.onSensesChange(sFld('sys-sense-tick', 0, { dataset: { tick: 'dim' }, checked: false })), 'shows' in h0(), S5.onSensesChange(sFld('sys-sense-from', 0, { value: 'f_keen' })), j(h0().range), S5.onSensesChange(sFld('sys-sense-from', 0, { value: '#n' })), j(h0().range), S5.onSensesChange(sFld('sys-light-punit', 0, { value: 'ft' })), S5.onSensesChange(sFld('sys-sense-unit', 7, { value: 'ft' }))];
        check('senses box: a name is kept as text cut to the label\'s length, a range only as a number; a unit only one the app knows (yards stored as none, and remembered for the next sense), each tick as its one value or none; the range source switches between a number and a field (the box redrawn); a box of another card, or a row not in the list, is not the Senses box\'s',
            j(hIn) === j([true, true, j({ by: 'n', n: 12.5 }), true, false, false, true, true]) && h0().name === longS.slice(0, SYl.LIMITS.label)
            && j(hCh) === j([true, '?', true, 'm', 'm', true, false, 'yd', true, 'pass', true, false, true, 'all', true, 'dim', true, false, true, j({ by: 'field', field: 'f_keen' }), true, j({ by: 'n', n: 0 }), false, true]) && S5.calls.all === 2 && S5.htmlSet.length === 0, j([hIn, hCh]));
        // senses S3: the box's eyes tick, a sense's own switch, the blind switch, their sentences and handlers, and the Sees without eyes template
        const swFields = () => [{ id: 'f_keen', key: 'Keen', label: T, kind: 'number', vis: 'all', edit: 'owner', def: 0 }, { id: 'f_deaf', key: 'Deaf', label: P, kind: 'toggle', vis: 'all', edit: 'gm' }, { id: 'f_gm', key: 'Secret', label: 'Secret', kind: 'number', vis: 'gm', def: 3 }, { id: 'f_bl', key: 'Blinded', label: 'Blinded', kind: 'toggle', vis: 'all', edit: 'owner' }, { id: 'f_txt', key: 'Txt', label: 'Txt', kind: 'text', vis: 'all' }, { id: 'f_fx', key: 'Fx', label: 'Fx', kind: 'formula', vis: 'all', formula: 'Keen' }];
        const d3 = { fields: swFields(), combat: { senses: { blind: { field: 'f_bl' }, list: [{ id: 'sn_aaaaaaaa', name: 'Eyes', range: { by: 'n', n: 6 }, unit: 'ft', grade: 'full', eyes: true, off: { field: 'f_deaf' } }, { id: 'sn_bbbbbbbb', name: 'Hear', range: { by: 'n', n: 9 }, grade: 'full', off: { field: 'f_gm' } }, { id: 'sn_cccccccc', name: 'Gone', range: { by: 'n', n: 3 }, grade: 'full', off: { field: 'f_gone' } }] } } };
        const S6 = mkSn(d3), r6 = S6.fake('div'); S6.sensesBox(r6, d3.combat);
        const offSel = byCls(S6, 'sys-sense-off'), blSel = byCls(S6, 'sys-sense-blind'), says6 = byCls(S6, 'sys-sense-says').map(e => e.textContent), blSays = byCls(S6, 'sys-blind-says').map(e => e.textContent), swOrder = ['', 'f_deaf', 'f_bl', 'f_keen', 'f_gm', 'f_fx'];
        check('senses box (S3): each row has its eyes tick and a switch list — never switched off, then the toggles, then numbers and formulas (never a text field), each named by its label as text, one no longer here shown as such; below the rows the blind switch over the same fields, "No blind switch" first; no markup',
            j(offSel.map(s => s.children.map(o => o.value))) === j([swOrder, swOrder, swOrder.concat(['f_gone'])]) && offSel[0].children[1].textContent === 'Off while ' + P && offSel[2].children[6].textContent === 'Off by a field no longer here'
            && j(offSel.map(s => s.children.filter(o => o.selected).map(o => o.value).join())) === j(['f_deaf', 'f_gm', 'f_gone']) && blSel.length === 1 && j(blSel[0].children.map(o => o.value)) === j(swOrder) && blSel[0].children.filter(o => o.selected)[0].value === 'f_bl' && blSel[0].children[1].textContent === 'Blind while ' + P
            && j(byCls(S6, 'sys-sense-tick').filter(c => c.dataset.tick === 'eyes').map(c => c.checked)) === j([true, false, false]) && S6.htmlSet.length === 0, j([offSel.map(s => s.children.map(o => o.value)), blSel.map(s => s.children.map(o => o.value))]));
        const blCase = sn => S6.blindSentence(sn);
        check('senses box (S3): each row\'s sentence says a sense of the eyes is off while blind, what switches it off (never the owner\'s warning for a GM-set switch), that Save drops one whose switch its owner cannot read, and keeps one whose switch is gone never switched off; the blind switch\'s sentence says what it does and that its owner can change it, or that it is missing, dropped or unset',
            says6[0].indexOf('A sense of the eyes: off while the character is blind.') > 0 && says6[0].indexOf('Off while ' + P + ' is ticked or above 0.') > 0 && says6[0].indexOf('Its owner can change that') < 0
            && says6[1] === 'Save drops this sense: its owner cannot read Secret, which switches it off (a GM-only value, or one worked out from one). Make that value visible to its owner, or have it never switched off.'
            && says6[2].indexOf('Its switch is no longer here: Save keeps the sense, never switched off.') > 0 && says6[2].indexOf('A sense of the eyes') < 0
            && blSays[0] === 'A character is blind while Blinded is ticked or above 0: its eyes see only its own cell, a sense of the eyes is off, and a sense that does not use the eyes still works. Its owner can change this on their sheet.'
            && blCase({}) === 'No field makes a character blind: the Blind tick in a token’s Properties still does.' && blCase({ blind: { field: 'f_zz' } }) === 'Pick the field that makes a character blind: Save leaves the blind switch out.' && blCase({ blind: 'x' }) === blCase({ blind: { field: 'f_zz' } })
            && blCase({ blind: { field: 'f_gm' } }) === 'Save drops the blind switch: its owner cannot read Secret (a GM-only value, or one worked out from one). Make that value visible to its owner.' && blCase({ blind: { field: 'f_deaf' } }).indexOf('Its owner can change') < 0 && blCase({ blind: { field: 'f_txt' } }) === blCase({ blind: { field: 'f_zz' } }), j([says6, blSays]));
        const S7h = mkSn(d3), sd7 = () => S7h.sensesDraft();
        const h7 = [S7h.onSensesChange(sFld('sys-sense-off', 0, { value: '' })), 'off' in sd7().list[0], S7h.onSensesChange(sFld('sys-sense-off', 0, { value: 'f_keen' })), j(sd7().list[0].off), S7h.onSensesChange(sFld('sys-sense-tick', 1, { dataset: { tick: 'eyes' }, checked: true })), sd7().list[1].eyes, S7h.onSensesChange(sFld('sys-sense-tick', 0, { dataset: { tick: 'eyes' }, checked: false })), 'eyes' in sd7().list[0],
            S7h.onSensesChange(sFld('sys-sense-blind', undefined, { value: 'f_deaf' })), j(sd7().blind), S7h.onSensesChange(sFld('sys-sense-blind', undefined, { value: '' })), 'blind' in sd7(), S7h.onSensesChange(sFld('sys-sense-off', 7, { value: 'f_keen' })), S7h.onSensesInput(sFld('sys-sense-blind', undefined, { value: 'x' }))];
        const dT = { fields: [], combat: {} }, S8 = mkSn(dT); S8.sensesClick(sBtn('snadd', undefined, 'noeyes')); S8.sensesClick(sBtn('snadd', undefined, 'dark')); const tpl8 = dT.combat.senses.list.map(x => [x.name, x.arc || '', x.eyes === true, x.shows || '']);
        check('senses box (S3): a sense\'s switch list sets or takes away its switch, the eyes tick sets or takes away eyes, the blind switch sets or takes away the blind switch (redrawing the box), all marking the draft changed; a row not in the list is left alone; Sees without eyes starts a sense all round, not of the eyes, and Sees without light one of the eyes that sees the dark as dim',
            j(h7) === j([true, false, true, '{"field":"f_keen"}', true, true, true, false, true, '{"field":"f_deaf"}', true, false, true, true]) && S7h.calls.all === 2 && S7h.calls.dirty >= 6 && sd7().list.length === 3
            && j(tpl8) === j([['Sees without eyes', 'all', false, ''], ['Sees in the dark', '', true, 'dim']]), j([h7, S7h.calls, tpl8]));
        // senses S7b: a row's "Sees through smoke" tick, its sentence and its handler
        const dV = { fields: [], combat: { senses: { list: [{ id: 'sn_aaaaaaaa', name: 'A', range: { by: 'n', n: 4 }, grade: 'full', veil: true }, { id: 'sn_bbbbbbbb', name: 'B', range: { by: 'n', n: 2 }, grade: 'mark', glyph: 'heat', veil: 'yes' }] } } }, SV = mkSn(dV), rV = SV.fake('div'); SV.sensesBox(rV, dV.combat);
        const vTicks = byCls(SV, 'sys-sense-tick').filter(c => c.dataset.tick === 'veil'), vSays = byCls(SV, 'sys-sense-says').map(e => e.textContent), v0 = () => dV.combat.senses.list[0], v1 = () => dV.combat.senses.list[1];
        const hV = [SV.onSensesChange(sFld('sys-sense-tick', 0, { dataset: { tick: 'veil' }, checked: false })), 'veil' in v0(), SV.onSensesChange(sFld('sys-sense-tick', 1, { dataset: { tick: 'veil' }, checked: true })), v1().veil, SV.onSensesChange(sFld('sys-sense-tick', 7, { dataset: { tick: 'veil' }, checked: true }))];
        check('senses box (S7b): each row has its Sees through smoke tick, ticked only by true; its sentence says it sees through smoke (never for any other value); the tick sets it as true or takes it away, a row not in the list left alone; no markup',
            j(vTicks.map(c => c.checked)) === j([true, false]) && vSays[0].indexOf('It sees through smoke.') > 0 && vSays[1].indexOf('smoke') < 0
            && j(hV) === j([true, false, true, true, true]) && dV.combat.senses.list.length === 2 && SV.htmlSet.length === 0 && sayOf({ range: { by: 'n', n: 2 }, grade: 'full', veil: 1 }).indexOf('smoke') < 0, j([hV, vTicks.map(c => c.checked), vSays]));
        // senses S4a-3: a row's Shows (everything in range or a nameless mark), a mark's glyph, its sentence, their handlers and the marks' templates
        const dMk = { fields: snFields(), combat: { senses: { list: [{ id: 'sn_aaaaaaaa', name: 'Hear', range: { by: 'n', n: 30 }, unit: 'ft', grade: 'mark', glyph: 'sound', walls: 'pass', arc: 'all' }, { id: 'sn_bbbbbbbb', name: 'Odd', range: { by: 'field', field: 'f_keen' }, grade: 'mark', glyph: 'constructor' }, { id: 'sn_cccccccc', name: 'Full', range: { by: 'n', n: 5 }, grade: 'full', shows: 'dim' }] } } };
        const SMk = mkSn(dMk), rMk = SMk.fake('div'); SMk.sensesBox(rMk, dMk.combat);
        const grSel = byCls(SMk, 'sys-sense-grade'), glSel = byCls(SMk, 'sys-sense-glyph'), mkSays = byCls(SMk, 'sys-sense-says').map(e => e.textContent), selOf = s => s.children.filter(o => o.selected).map(o => o.value).join();
        check('senses box (S4a-3): each row shows what it shows — everything in range or a nameless mark — and a mark row its mark (a sound, a tremor, a presence, heat; one the app does not know shown as a presence) but no dim tick; each as text, no markup',
            j(grSel.map(s => s.children.map(o => o.value + ':' + o.textContent))) === j([0, 1, 2].map(() => ['full:Shows everything in range', 'mark:A nameless mark'])) && j(grSel.map(selOf)) === j(['mark', 'mark', 'full'])
            && glSel.length === 2 && j(glSel[0].children.map(o => o.value)) === j(['sound', 'tremor', 'presence', 'heat']) && glSel[0].children[1].textContent === 'Mark: a tremor' && j(glSel.map(selOf)) === j(['sound', 'presence'])
            && j(byCls(SMk, 'sys-sense-tick').map(c => c.dataset.tick)) === j(['walls', 'arc', 'eyes', 'veil', 'walls', 'arc', 'eyes', 'veil', 'walls', 'arc', 'dim', 'eyes', 'veil']) && SMk.htmlSet.length === 0, j([grSel.map(selOf), glSel.map(selOf), byCls(SMk, 'sys-sense-tick').map(c => c.dataset.tick)]));
        check('senses box (S4a-3): a mark row\'s sentence says it marks every creature within its reach and that a creature it finds the eyes do not see shows to its player as a nameless mark, never as itself, with the mark\'s shape and word; a full row\'s sentence is as before',
            mkSays[0] === 'Marks every creature within 30 feet, through walls, all round. Every character has this sense. A creature it finds that the eyes do not see shows to its player as a nameless mark in its cell, never as itself: three arcs, “Heard”.'
            && mkSays[1] === 'Marks every creature within the character’s ' + T + ' (in yards). A value of 0 or less: that character does not have it. Its owner can change this on their sheet. A creature it finds that the eyes do not see shows to its player as a nameless mark in its cell, never as itself: a ring round a dot, “Sensed”.'
            && mkSays[2] === 'Sees everything within 5 yards. Every character has this sense. What it sees in the dark it sees as dim.' && ['tremor', 'heat'].map(g => sayOf({ range: { by: 'n', n: 2 }, grade: 'mark', glyph: g })).join('|') === ['a zigzag, “Felt”', 'a teardrop, “Heat”'].map(w => 'Marks every creature within 2 yards. Every character has this sense. A creature it finds that the eyes do not see shows to its player as a nameless mark in its cell, never as itself: ' + w + '.').join('|'), j(mkSays));
        const dG = { fields: [], combat: { senses: { list: [{ id: 'sn_aaaaaaaa', name: 'A', range: { by: 'n', n: 1 }, grade: 'full', shows: 'dim' }, { id: 'sn_bbbbbbbb', name: 'B', range: { by: 'n', n: 1 }, grade: 'mark', glyph: 'heat' }] } } }, SG = mkSn(dG), g0 = () => dG.combat.senses.list[0], g1 = () => dG.combat.senses.list[1];
        const hG = [SG.onSensesChange(sFld('sys-sense-grade', 0, { value: 'mark' })), j(g0()), SG.calls.all, SG.onSensesChange(sFld('sys-sense-glyph', 0, { value: 'sound' })), g0().glyph, SG.onSensesChange(sFld('sys-sense-glyph', 0, { value: 'constructor' })), g0().glyph, SG.calls.all,
            SG.onSensesChange(sFld('sys-sense-grade', 0, { value: 'full' })), j(g0()), SG.onSensesChange(sFld('sys-sense-glyph', 0, { value: 'heat' })), 'glyph' in g0(), SG.onSensesChange(sFld('sys-sense-grade', 1, { value: 'mark' })), g1().glyph,
            SG.onSensesChange(sFld('sys-sense-grade', 1, { value: 'x' })), g1().grade, SG.onSensesChange(sFld('sys-sense-grade', 7, { value: 'full' })), SG.onSensesInput(sFld('sys-sense-grade', 0, { value: 'mark' })), g0().grade, SG.calls.all];
        check('senses box (S4a-3): Shows sets a row to a mark (its dim taken away, its mark kept or a presence) or back to everything in range (its mark taken away), redrawing the box; a mark\'s list sets only a mark the app knows, only on a mark row; any other value, or a row not in the list, changes nothing',
            j(hG) === j([true, j({ id: 'sn_aaaaaaaa', name: 'A', range: { by: 'n', n: 1 }, grade: 'mark', glyph: 'presence' }), 1, true, 'sound', true, 'sound', 1, true, j({ id: 'sn_aaaaaaaa', name: 'A', range: { by: 'n', n: 1 }, grade: 'full' }), true, false, true, 'heat', true, 'mark', true, true, 'full', 3]) && SG.htmlSet.length === 0, j(hG));
        const tplOf = flds => { const d = { fields: flds, combat: { light: { presets: [{ name: 'Torch', bright: 1, dim: 2, unit: 'ft' }] } } }, Sx = mkSn(d); ['hears', 'feels', 'near', 'creature'].forEach(t => Sx.sensesClick(sBtn('snadd', undefined, t))); return d.combat.senses.list; };
        const deafV = { id: 'f_deaf', key: 'Deafened', label: 'Deafened', kind: 'toggle', vis: 'all', edit: 'gm' }, deafG = { id: 'f_dgm', key: 'DeafenedGM', label: 'Deaf (GM)', kind: 'toggle', vis: 'gm' };
        const tplA = tplOf([{ id: 'f_prone', key: 'Prone', label: 'Prone', kind: 'toggle', vis: 'all', edit: 'owner' }, deafG, deafV]), tplB = tplOf([deafG]), tplC = tplOf([{ id: 'f_dn', key: 'Deafness', label: 'Deafness', kind: 'number', vis: 'all' }]);
        const tplRow = r => [r.name, r.grade, r.glyph, r.walls, r.arc, j(r.range), r.unit, r.off ? r.off.field : ''], srtK = v => Array.isArray(v) ? v.map(srtK) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = srtK(v[k]); return o; }, {}) : v;
        const secM = SYl.secretFieldIds({ fields: SYl.gmViewFields({ fields: [deafG, deafV] }, FOs) }, FOs), keptM = SYl.cleanSenses({ list: tplA }, { f_deaf: 'toggle', f_dgm: 'toggle' }, secM);
        check('senses box (S4a-3): the marks\' templates — Hears (a sound, off while a Deafened toggle its owner can read, if there is one), Feels through the ground (a tremor), Senses what is near (a presence), A creature\'s sense (a tremor with a range of 0) — each a nameless mark through walls, all round, in the system\'s first light\'s unit; Save keeps them whole',
            j(tplA.map(tplRow)) === j([['Hearing', 'mark', 'sound', 'pass', 'all', j({ by: 'n', n: 0 }), 'ft', 'f_deaf'], ['Tremorsense', 'mark', 'tremor', 'pass', 'all', j({ by: 'n', n: 0 }), 'ft', ''], ['Presence', 'mark', 'presence', 'pass', 'all', j({ by: 'n', n: 0 }), 'ft', ''], ['A creature’s sense', 'mark', 'tremor', 'pass', 'all', j({ by: 'n', n: 0 }), 'ft', '']])
            && !('off' in tplB[0]) && !('off' in tplC[0]) && tplA.every(r => /^sn_[a-z0-9]{8}$/.test(r.id)) && keptM && j(srtK(keptM.list)) === j(srtK(tplA)), j([tplA.map(tplRow), tplB[0], tplC[0], keptM]));
        const fogM = read('fog.js'), fogSnLine = (fogM.match(/\n    var stxt = ui\('fogSensesText'\);[^\n]*\n/) || [''])[0];
        check('senses: the fog menu names the system\'s senses as text (textContent, the names joined, or a fixed sentence with none), shows the line only with a system, and its Edit button opens the System editor\'s Items tab — no markup',
            /stxt\.textContent = snn\.length \? snn\.join\(', '\) : 'This system defines no extra senses'; \}/.test(fogSnLine) && !/innerHTML|insertAdjacentHTML|outerHTML/.test(fogSnLine)
            && /var srow = ui\('fogSensesRow'\); if \(srow\) srow\.style\.display = camp && camp\.system && typeof camp\.system === 'object' \? '' : 'none';/.test(fogM)
            && /if \(sedit\) sedit\.addEventListener\('click', function\(\) \{ closeMenu\(\); if \(window\.wpSheets && window\.wpSheets\.open\) window\.wpSheets\.open\('items'\); \}\);/.test(fogM)
            && /<span id="fogSensesText"[^>]*><\/span>/.test(read('../index.html')), fogSnLine.slice(0, 200));
        check('senses box (sheets.js): the Combat card builds it after the Light box, and its boxes, selects and buttons are handled after the Light box\'s',
            /\n    lightBox\(box, cm\);[^\n]*\n    sensesBox\(box, cm\);/.test(shL) && /if \(onLightInput\(t\)\) return;[^\n]*\n\s*if \(onSensesInput\(t\)\) return;/.test(shL) && /if \(onLightChange\(t\)\) return;[^\n]*\n\s*if \(onSensesChange\(t\)\) return;/.test(shL) && /if \(lightClick\(b\)\) return;[^\n]*\n\s*if \(sensesClick\(b\)\) return;/.test(shL));
        check('light box (sheets.js): the Combat card builds it, and its boxes, selects and buttons are handled before the card\'s other handlers',
            /\n    lightBox\(box, cm\);[^\n]*\n    sensesBox\(box, cm\);[^\n]*\n    turnBox\(box, cm\);/.test(shL) && /\n    if \(onLightInput\(t\)\) return;/.test(shL) && /\n    if \(onLightChange\(t\)\) return;/.test(shL) && /\n    if \(lightClick\(b\)\) return;/.test(shL));
        // range penalties R1: the Combat card's Range box (sheets.js rangeBox) on the same recording page, and the ruler's and a target mark's
        // words (whiteboard.js, sliced by its rangelabel markers)
        const rbSrc = slice('sheets.js', 'rangebox'), FRl = await import(modUrl('formula.js'));
        const mkRange = (draft0, errs) => {
            const made = [], htmlSet = [], calls = { dirty: 0, patched: 0, all: 0, toasts: [] };
            const fake = tag => { const e = { tag, children: [], childNodes: [], style: {}, dataset: {}, className: '', textContent: '', appendChild(k) { this.children.push(k); this.childNodes.push(k); return k; }, addEventListener() {} }; ['innerHTML', 'outerHTML'].forEach(p => Object.defineProperty(e, p, { set(v) { htmlSet.push(v); }, get() { return ''; } })); e.insertAdjacentHTML = (w, v) => { htmlSet.push(v); }; made.push(e); return e; };
            const doc = { createElement: fake, createTextNode: t => { const n = { tag: '#text', textContent: String(t) }; made.push(n); return n; } };
            const env = { draft: draft0, document: doc, LIMITS: SYl.LIMITS, RANGE_UNITS: SYl.RANGE_UNITS, markDirty: () => { calls.dirty++; }, patchErrors: () => { calls.patched++; }, renderAll: () => { calls.all++; }, toast: m => calls.toasts.push(m), errs: errs || [] };
            const api = new Function('env', "'use strict';\nvar draft = env.draft, document = env.document, LIMITS = env.LIMITS, RANGE_UNITS = env.RANGE_UNITS, markDirty = env.markDirty, patchErrors = env.patchErrors, renderAll = env.renderAll, toast = env.toast;\n"
                + lineAt('function el(tag, cls, text) {') + '\n' + lineAt('function opt(value, text, selected) {') + '\n' + lineAt('function input(cls, value, title, placeholder) {') + '\n' + lineAt('function select(cls, options, value, title) {') + '\n' + lineAt('function labeledSelect(cls, cap, options, value, title) {') + '\n'
                + "function errorCell(id) { var cell = el('div', 'sys-err'); env.errs.forEach(function(m) { cell.appendChild(el('div', 'sys-err-line', m)); }); return cell; }\n"
                + rbSrc + '\nreturn { rangeBox: rangeBox, onRangeInput: onRangeInput, onRangeChange: onRangeChange, rangeClick: rangeClick };')(env);
            api.made = made; api.htmlSet = htmlSet; api.calls = calls; api.fake = fake; return api;
        };
        const cmRf = { range: { formula: T, unit: P } }, BR1 = mkRange({ combat: cmRf }, [T]), rootR1 = BR1.fake('div'); BR1.rangeBox(rootR1, cmRf);
        const cmRt = { range: { steps: [{ to: T, mod: P }, { to: 5, mod: -2 }], unit: 'constructor' } }, BR2 = mkRange({ combat: cmRt }), rootR2 = BR2.fake('div'); BR2.rangeBox(rootR2, cmRt);
        const fmR1 = byCls(BR1, 'sys-range-formula'), unR1 = byCls(BR1, 'sys-range-unit'), toR2 = byCls(BR2, 'sys-range-sto'), mdR2 = byCls(BR2, 'sys-range-smod'), unR2 = byCls(BR2, 'sys-range-unit');
        check('range box: the sliced source writes no markup; a hostile formula lands as an input value, what Save would drop as a text node, a hostile unit picks yards; a step\'s boxes show only numbers; nothing is written through innerHTML',
            !/innerHTML|insertAdjacentHTML|outerHTML/.test(rbSrc) && !/innerHTML|insertAdjacentHTML|outerHTML/.test(lineAt('function labeledSelect(cls, cap, options, value, title) {')) && BR1.htmlSet.length === 0 && BR2.htmlSet.length === 0
            && fmR1.length === 1 && fmR1[0].value === T && fmR1[0].type === 'text' && BR1.made.some(e => e.textContent === T && e.className === 'sys-err-line') && j(unR1[0].children.filter(o => o.selected).map(o => o.value)) === j(['yd'])
            && j(toR2.map(i => i.value)) === j(['', '5']) && j(mdR2.map(i => i.value)) === j(['', '-2']) && toR2.concat(mdR2).every(i => i.type === 'number') && j(unR2[0].children.filter(o => o.selected).map(o => o.value)) === j(['yd'])
            && BR1.made.concat(BR2.made).every(e => e.tag !== 'script' && e.tag !== 'img' && e.tag !== 'a'), j([BR1.htmlSet, fmR1.map(i => i.value), toR2.map(i => i.value), mdR2.map(i => i.value)]));
        const dRx = { combat: { range: { by: 'table', steps: [{ to: 1, mod: 0 }] } } }, BR3 = mkRange(dRx), tgRx = (cls, value, row) => ({ className: cls, value: value, dataset: {}, closest: s => (s === '.sys-range-row' && row) || null });
        BR3.onRangeInput(tgRx('field sys-range-sto', T, { dataset: { ri: '0' } })); BR3.onRangeInput(tgRx('field sys-range-smod', P, { dataset: { ri: '0' } })); BR3.onRangeChange(tgRx('sys-range-unit', P)); BR3.onRangeChange(tgRx('sys-range-by', 'formula')); BR3.onRangeInput(tgRx('field sys-range-formula', T + 'x'.repeat(400)));
        check('range box: its handlers take a step\'s boxes only as numbers (hostile text removes the key), a unit only from the app\'s own list, and the formula as text cut at 300 (Save cleans it: a formula that names anything but Distance is dropped)',
            j(dRx.combat.range._s) === j([{}]) && !('unit' in dRx.combat.range) && dRx.combat.range.formula.length === SYl.LIMITS.formula && dRx.combat.range.formula.indexOf(T) === 0 && SYl.cleanRangeRules({ formula: T }, FRl) === null && !!SYl.cleanRangeRules({ formula: 'Distance' }, FRl), j(dRx.combat.range));
        const rlS = slice('whiteboard.js', 'rangelabel'), winRl = { wpSystemCore: SYl, wpSheets: { systemOf: () => ({ combat: { range: { steps: [{ to: 1, mod: -4 }] } } }) } };
        const RL = new Function('esc', 'window', 'stanceOn', 'tokenElevation', "'use strict';\n" + rlS + '\nreturn { rangeSeen: rangeSeen, rangeModText: rangeModText, rangeTitle: rangeTitle, rulerRangeText: rulerRangeText, targetRangeHtml: targetRangeHtml };')(SC.esc, winRl, () => false, () => 0);
        const hostR = { mod: T, dist: P, unit: T }, markRl = '<span class="target-mark">AB</span>';
        check('range words: the ruler\'s line and a target mark\'s tag are built from a number and a unit from the app\'s own list only — a hostile modifier shows nothing, a hostile unit reads yards, a hostile distance is no number — escaped, never a name from a file; the sliced source writes no markup of its own',
            !/innerHTML|insertAdjacentHTML|outerHTML/.test(rlS) && RL.rangeModText(T) === '' && RL.rulerRangeText(1, 2, hostR) === '<text x="1" y="2">Range </text>' && RL.targetRangeHtml(markRl, hostR).indexOf('<img') < 0 && RL.targetRangeHtml(markRl, hostR).indexOf(' onmouseover="') < 0
            && / yd\)$/.test(RL.rangeTitle(hostR)) && RL.rangeTitle(hostR).indexOf('<') < 0 && !/esc\(rg\.unit|rg\.unit \+/.test(rlS), j([RL.rulerRangeText(1, 2, hostR), RL.targetRangeHtml(markRl, hostR), RL.rangeTitle(hostR)]));
        // item 19 H2: the height words (whiteboard.js, sliced by its heightlabel markers): a number and the viewer's own unit only, escaped
        const hlS = slice('whiteboard.js', 'heightlabel'), sysHl = { combat: { height: { steps: [{ to: 0, mod: 0 }, { to: 1000, mod: 2 }] } } };
        const mkHL = unit => new Function('esc', 'window', 'stanceOn', 'lenUnit', 'fmtElev', 'rangeModText', "'use strict';\n" + hlS + '\nreturn { heightSeen: heightSeen, heightTitle: heightTitle, rulerHeightText: rulerHeightText, targetHeightHtml: targetHeightHtml };')(SC.esc, { wpSystemCore: SYl, wpSheets: { systemOf: () => sysHl } }, () => true, () => unit, e => { const v = unit === 'm' ? e * 0.9144 : e; return (v > 0 ? '+' : v < 0 ? '-' : '') + Math.round(Math.abs(v) * 10) / 10; }, RL.rangeModText);
        const HLi = mkHL('yd'), HLm = mkHL('m'), hostH = { mod: '<img src=x onerror=alert(1)>', diff: '<b>', unit: '<script>' };
        const hsn = HLi.heightSeen({ id: 'a', x: 0, y: 0, elevation: 4 }, { id: 'b', x: 300, y: 0 });
        check('item 19 H2 height words: the ruler\'s line and a target mark\'s tag are built from a number and the viewer\'s own unit only — 12 feet above reads +4 yd, or +3.7 m in metres, level with none; a hostile modifier shows nothing, a hostile difference reads level, a hostile unit counts as yards, all escaped; a zero modifier adds no tag; the sliced source writes no markup of its own',
            HLi.heightTitle({ mod: 1, diff: 12, unit: 'ft' }) === 'Height +1 (+4 yd)' && HLm.heightTitle({ mod: 1, diff: 12, unit: 'ft' }) === 'Height +1 (+3.7 m)' && HLi.heightTitle({ mod: 0, diff: 0, unit: 'yd' }) === 'Height 0 (level)'
            && HLi.rulerHeightText(1, 2, hostH) === '<text x="1" y="2">Height  (level)</text>' && HLi.targetHeightHtml('<b>M</b>', { mod: 0, diff: 1, unit: 'yd' }) === '<b>M</b>' && /class="target-height" title="Height \+2 \(\+3 yd\)">\+2<\/span>/.test(HLi.targetHeightHtml('<b>M</b>', { mod: 2, diff: 3, unit: 'yd' }))
            && HLi.targetHeightHtml('M', hostH) === 'M' && !!hsn && hsn.mod === 2 && hsn.diff === 4 && !/innerHTML|insertAdjacentHTML|outerHTML/.test(hlS), j([HLi.heightTitle({ mod: 1, diff: 12, unit: 'ft' }), HLm.heightTitle({ mod: 1, diff: 12, unit: 'ft' }), HLi.rulerHeightText(1, 2, hostH), hsn]));
        const HL5 = new Function('esc', 'window', 'stanceOn', 'lenUnit', 'fmtElev', 'rangeModText', 'tokenGround', "'use strict';\n" + hlS + '\nreturn heightSeen;')(SC.esc, { wpSystemCore: SYl, wpSheets: { systemOf: () => sysHl } }, () => true, () => 'yd', String, RL.rangeModText, (t, m) => (m === 'MAP' && t.id === 'b' ? 9 : 0));
        const hs5 = [HL5({ id: 'a', x: 0, y: 0, elevation: 4 }, { id: 'b', x: 300, y: 0 }, 'MAP'), HL5({ id: 'a', x: 0, y: 0, elevation: 4 }, { id: 'b', x: 300, y: 0 })];
        check('item 19b H5 the height words read each token on the ground it stands on (run for real): given the map, the ruler\'s and a target mark\'s height modifier counts the ground under both tokens (4 yards up against a target on a 9-yard hill is 5 below: no bonus); without a map the tokens\' own elevations as before',
            !!hs5[0] && hs5[0].diff === -5 && hs5[0].mod === 0 && !!hs5[1] && hs5[1].diff === 4 && hs5[1].mod === 2, j(hs5));
        check('item 19 H2 height words (wiring): the ruler adds the height only through rulerHeightText between two tokens, a target mark only through targetHeightHtml from each targeter\'s token, its signature carrying each height and the viewer\'s unit',
            wbL.includes("var hgR = bothTok ? heightSeen(tA, tB, amR) : null;") && wbL.includes("if (hgR) html += rulerHeightText(mx + 8,") && wbL.includes("var thgt = tgs.map(function(t) { var mh = targeterTok(t.id, activeMap); return mh && mh !== item ? heightSeen(mh, item, activeMap) : null; });")
            && wbL.includes("tsig += '|' + thgt.map(function(h) { return h ? h.mod + ':' + h.diff : ''; }).join(',') + '|' + (state.measureUnit || '');") && (wbL.match(/rulerHeightText\(/g) || []).length === 2 && (wbL.match(/targetHeightHtml\(/g) || []).length === 2);
        check('range box and words (wiring): the Combat card builds the Range box before the Light box and hands its events on after the Senses box; the ruler and a target mark add the range only through rulerRangeText and targetRangeHtml',
            /\n    rangeBox\(box, cm\);[^\n]*\n    heightBox\(box, cm\);[^\n]*\n    lightBox\(box, cm\);/.test(shL) && /if \(onSensesInput\(t\)\) return;[^\n]*\n\s*if \(onRangeInput\(t\)\) return;/.test(shL) && /if \(sensesClick\(b\)\) return;[^\n]*\n\s*if \(rangeClick\(b\)\) return;/.test(shL)
            && (wbL.match(/rulerRangeText\(/g) || []).length === 2 && (wbL.match(/targetRangeHtml\(/g) || []).length === 2 && !/rgR\.mod|trng\[ti\]\.mod/.test(wbL));
        // item 19b H4: the Height box's True 3D sightline row (sheets.js heightBox, sliced by its heightbox2 markers) on a recording page
        const hb4Src = slice('sheets.js', 'heightbox2');
        const mkHeight4 = (draft0, win) => {
            const made = [], htmlSet = [], calls = { dirty: 0, patched: 0, all: 0 };
            const fake = tag => { const e = { tag, children: [], childNodes: [], style: {}, dataset: {}, className: '', textContent: '', appendChild(k) { this.children.push(k); this.childNodes.push(k); return k; }, addEventListener() {} }; ['innerHTML', 'outerHTML'].forEach(p => Object.defineProperty(e, p, { set(v) { htmlSet.push(v); }, get() { return ''; } })); e.insertAdjacentHTML = (w, v) => { htmlSet.push(v); }; made.push(e); return e; };
            const doc = { createElement: fake, createTextNode: t => { const n = { tag: '#text', textContent: String(t) }; made.push(n); return n; } };
            const env = { draft: draft0, document: doc, LIMITS: SYl.LIMITS, HEIGHT_UNITS: SYl.HEIGHT_UNITS, markDirty: () => { calls.dirty++; }, patchErrors: () => { calls.patched++; }, renderAll: () => { calls.all++; }, toast: () => {}, window: win };
            const api = new Function('env', "'use strict';\nvar draft = env.draft, document = env.document, LIMITS = env.LIMITS, HEIGHT_UNITS = env.HEIGHT_UNITS, markDirty = env.markDirty, patchErrors = env.patchErrors, renderAll = env.renderAll, toast = env.toast, window = env.window;\n"
                + lineAt('function el(tag, cls, text) {') + '\n' + lineAt('function opt(value, text, selected) {') + '\n' + lineAt('function input(cls, value, title, placeholder) {') + '\n' + lineAt('function select(cls, options, value, title) {') + '\n' + lineAt('function labeledSelect(cls, cap, options, value, title) {') + '\n'
                + "function errorCell(id) { return el('div', 'sys-err'); }\n"
                + hb4Src + '\nreturn { heightBox: heightBox, onHeightInput: onHeightInput, onHeightChange: onHeightChange };')(env);
            api.made = made; api.htmlSet = htmlSet; api.calls = calls; api.fake = fake; return api;
        };
        const cmH4 = { height: { line3d: true, eye: T, formula: T, unit: P } }, BH4 = mkHeight4({ combat: cmH4 }, { wpStance: { lenUnit: () => T, ydOut: v => v, ydIn: v => Number(v) } }), rootH4 = BH4.fake('div'); BH4.heightBox(rootH4, cmH4);
        const cmH5 = { height: { line3d: P, eye: 3 } }, BH5 = mkHeight4({ combat: cmH5 }, {}), rootH5 = BH5.fake('div'); BH5.heightBox(rootH5, cmH5);
        const tkH4 = byCls(BH4, 'sys-height-3d'), eyH4 = byCls(BH4, 'sys-height-eye'), tkH5 = byCls(BH5, 'sys-height-3d'), eyH5 = byCls(BH5, 'sys-height-eye');
        check('item 19b H4 height box: the True 3D sightline row writes no markup — the tick is checked only for true (a hostile value leaves it off and draws no Standing height box), a hostile standing height shows an empty number box, its caption one of the app\'s two fixed texts whatever a unit helper says; nothing is written through innerHTML',
            !/innerHTML|insertAdjacentHTML|outerHTML/.test(hb4Src) && BH4.htmlSet.length === 0 && BH5.htmlSet.length === 0 && tkH4.length === 1 && tkH4[0].type === 'checkbox' && tkH4[0].checked === true && eyH4.length === 1 && eyH4[0].type === 'number' && eyH4[0].value === ''
            && BH4.made.some(e => e.className === 'sys-num-cap' && e.textContent === 'Standing height (yards)') && !BH4.made.some(e => typeof e.textContent === 'string' && e.textContent.indexOf(T) >= 0)
            && tkH5.length === 1 && tkH5[0].checked === false && eyH5.length === 0 && BH4.made.concat(BH5.made).every(e => e.tag !== 'script' && e.tag !== 'img' && e.tag !== 'a' && String(e.title || '').indexOf('<') < 0),
            j([BH4.htmlSet, tkH4.map(e => e.checked), eyH4.map(e => e.value), tkH5.map(e => e.checked), eyH5.length]));
        const dH6 = { combat: { height: {} } }, BH6 = mkHeight4(dH6, {});
        BH6.onHeightChange({ className: 'sys-height-3d', checked: P }); const offH6 = j(dH6.combat); BH6.onHeightChange({ className: 'sys-height-3d', checked: true }); BH6.onHeightInput({ className: 'field sys-height-eye', value: T, dataset: {} }); const hostH6 = j(dH6.combat.height);
        BH6.onHeightInput({ className: 'field sys-height-eye', value: '1e400', dataset: {} }); const infH6 = j(dH6.combat.height); BH6.onHeightInput({ className: 'field sys-height-eye', value: '1.5', dataset: {} });
        check('item 19b H4 height box: its handlers take the tick only as true and the standing height only as a finite number (hostile text, or a number past every bound, takes the key away); Save cleans both again',
            offH6 === j({}) && hostH6 === j({ line3d: true }) && infH6 === j({ line3d: true }) && j(dH6.combat.height) === j({ line3d: true, eye: 1.5 }) && SYl.cleanHeightRules({ line3d: T, eye: 1 }, FRl) === null && j(SYl.cleanHeightRules({ line3d: true, eye: T }, FRl)) === j({ line3d: true }), j([offH6, hostH6, infH6, dH6.combat.height]));
    }
    /* ---- Senses S2b: a token's Senses block in its Properties — a sense's name comes from a system file, a token's own ranges from a save ---- */
    {
        const j = JSON.stringify, FCs = await import(modUrl('fogcore.js')), inspS = read('inspector.js');
        const escLineS = /\n  function esc\(s\)\{[^\n]*\}\n/.exec(inspS), escS = escLineS ? new Function(escLineS[0] + '\nreturn esc;')() : SC.esc;
        const mkSf = (camp, opt) => {
            const o = opt || {}, calls = { saves: 0, renders: 0, inspectors: 0, vision: 0, redraws: 0 };
            const win = { wpFog: o.noFog ? undefined : { campSenses: () => (o.list || []), campMarkSenses: () => (o.marks || []), tokenSenses: (w, map, c, waived) => { calls.asked = [w.id, map && map.id, !!c, waived]; return o.ts || { full: [] }; }, invalidateVision() { calls.vision++; }, redraw() { calls.redraws++; } } };
            if (o.sc) win.wpSystemCore = o.sc;
            if (!o.noCore) win.wpFogCore = FCs;
            const env = { getActiveCampaign: () => camp, window: win, save: () => { calls.saves++; }, render: () => { calls.renders++; }, renderInspector: () => { calls.inspectors++; } };
            const api = new Function('env', 'esc', "'use strict';\nvar getActiveCampaign = env.getActiveCampaign, window = env.window, save = env.save, render = env.render, renderInspector = env.renderInspector;\n" + slice('inspector.js', 'sensesfield') + '\nreturn { sensesFieldHtml: sensesFieldHtml, setTokenSense: setTokenSense, setTokenBlind: setTokenBlind, setTokenUnsensed: setTokenUnsensed, nullsFieldHtml: nullsFieldHtml, setItemNulls: setItemNulls };')(env, escS);
            api.calls = calls; return api;
        };
        const listS = [{ id: 'sn_aaaaaaaa', name: T, unit: 'ft' }, { id: 'sn_bbbbbbbb', name: P, unit: P }, { id: 'sn_cccccccc', name: 'Tremorsense', unit: 'm' }, { id: 'sn_dddddddd', name: 'Scent', unit: 'cells' }, { id: 'sn_eeeeeeee', name: 'Echo' }];
        const tsS = { sheet: false, full: [{ id: 'sn_aaaaaaaa', n: 30, cells: 6, from: 'token' }, { id: 'sn_bbbbbbbb', n: 1, cells: 1, from: 'field' }, { id: 'sn_cccccccc', n: 9000, cells: 60, from: 'n' }, { id: 'sn_dddddddd', n: 0.4, cells: 0, from: 'n' }] };
        const campS = { id: 'c1', chars: { c_a: { id: 'c_a' } } }, tokS = { id: 't1', isChar: true, ownerId: 'u_a', charId: 'c_a', senses: [{ id: 'sn_aaaaaaaa', n: 30 }, { id: 'sn_eeeeeeee', n: 0 }, { id: 'sn_bbbbbbbb', n: '1" onfocus="alert(1)' }, { id: '"><img src=x>', n: 4 }] };
        const IS = mkSf(campS, { list: listS, ts: tsS }), hS = IS.sensesFieldHtml(tokS, { id: 'm1' });
        const rowsS = Array.from(hS.matchAll(/<span style="flex:1 1 120px; min-width:0;">([^<]*)<\/span><input type="number" class="wb-sense-ov" data-si="([^"]*)" min="0" max="100000" step="any" value="([^"]*)"[^>]*><span class="muted">([^<]*)<\/span><\/div><div class="muted"[^>]*>([^<]*)<\/div>/g)).map(m => m.slice(1));
        check('senses block: hostile sense names render without a crash and nothing in the block can run or call out; each name lands escaped as text, the place in the list is digits, a value only a number the fogcore cleaner kept',
            risks(hS).length === 0 && hS.indexOf(T) < 0 && hS.indexOf(P) < 0 && hS.indexOf('onfocus') < 0 && hS.indexOf('<img') < 0 && rowsS.length === 5 && j(rowsS.map(r => [r[0], r[1], r[2]])) === j([[escS(T), '0', '30'], [escS(P), '1', ''], ['Tremorsense', '2', ''], ['Scent', '3', ''], ['Echo', '4', '0']]), j([risks(hS), rowsS]));
        check('senses block: each sense reads as this token has it on this map — its range in its unit (a unit the app does not know reads yards) and where it comes from (the token\'s own, the sheet, the system), then its cells; one cell, the cap (the most a sense reaches), under one cell, off for this token (its own 0), not held',
            j(rowsS.map(r => [r[3], r[4]])) === j([['ft', '30 ft, this token’s own: 6 cells on this map'], ['yd', '1 yd, from the sheet: 1 cell on this map'], ['m', '9000 m, the system’s: 60 cells on this map, the most a sense reaches'], ['cells', '0.4 cells, the system’s: under one cell on this map'], ['yd', 'Off for this token']])
            && j(IS.calls.asked) === j(['t1', 'm1', true, false]) && /<label>Senses<\/label><div class="muted"[^>]*>Read from the token only: its player does not hold this character\.<\/div>/.test(hS), j([rowsS.map(r => [r[3], r[4]]), IS.calls.asked]));
        const hOdd = mkSf(campS, { list: listS.slice(2, 3), ts: { sheet: true, full: [{ id: 'sn_cccccccc', n: T, cells: 2, from: 'n' }] } }).sensesFieldHtml({ id: 't5', isChar: true }, { id: 'm1' });
        check('senses block: what a sense reads as is written as text even where its range were no number', risks(hOdd).length === 0 && hOdd.indexOf(T) < 0 && hOdd.indexOf(escS(T) + ' m, the system’s: 2 cells on this map') > 0, hOdd);
        const hNot = mkSf(campS, { list: listS.slice(2, 3), ts: { sheet: true, full: [] } }).sensesFieldHtml({ id: 't2', isChar: true, charId: 'c_a', ownerId: 'u_a' }, { id: 'm1' });
        const hNpc = mkSf(campS, { list: listS.slice(2, 3), ts: { sheet: false, full: [] } }), hNpcH = hNpc.sensesFieldHtml({ id: 't3', isChar: true, charId: 'c_a' }, { id: 'm1' });
        const hProto = mkSf({ id: 'c1', chars: {} }, { list: listS.slice(2, 3), ts: { sheet: false, full: [] } }).sensesFieldHtml({ id: 't4', isChar: true, ownerId: 'u_a', charId: 'constructor' }, { id: 'm1' });
        check('senses block: a sense this token lacks reads "Not held"; the note that the sheet was not read shows only for a player\'s token on a character of the campaign\'s own (never an NPC token, a character the campaign lacks or a prototype\'s name); an NPC token asks with the sheet\'s rule waived',
            /<div class="muted"[^>]*>Not held<\/div>/.test(hNot) && hNot.indexOf('Read from the token only') < 0 && hNpcH.indexOf('Read from the token only') < 0 && j(hNpc.calls.asked) === j(['t3', 'm1', true, true]) && hProto.indexOf('Read from the token only') < 0, [hNot, hNpcH]);
        const TICK = '<div class="field check-row"><input type="checkbox" id="wbBlindTick" > <label for="wbBlindTick" title="Its eyes see only its own cell, whatever the light; a sense that does not use the eyes still works. Only its player receives this.">Blind</label></div>';
        const emptyS = [mkSf(null, { list: listS }).sensesFieldHtml(tokS, { id: 'm1' }), mkSf(campS, { list: [] }).sensesFieldHtml(tokS, { id: 'm1' }), mkSf(campS, { list: listS, noFog: true }).sensesFieldHtml(tokS, { id: 'm1' }), mkSf(campS, { list: listS, noCore: true }).sensesFieldHtml(tokS, { id: 'm1' })];
        check('senses block: nothing at all without a campaign, the fog module or its cleaner; with no sense in the system, the Blind tick alone (senses S3)', j(emptyS) === j(['', TICK, '', '']), j(emptyS));
        // senses S3: the Blind tick, the sheet's blindness, a sense held but off
        const tickOf = (w, ts) => mkSf(campS, { list: [], ts: ts }).sensesFieldHtml(w, { id: 'm1' });
        const tk = { on: tickOf({ id: 'b1', isChar: true, blind: true }), yes: tickOf({ id: 'b2', isChar: true, blind: 'yes' }), sheet: tickOf({ id: 'b3', isChar: true }, { full: [], blind: true }), both: tickOf({ id: 'b4', isChar: true, blind: true }, { full: [], blind: true }) };
        check('senses block (S3): the Blind tick is ticked only for a token whose tick is true; a token its sheet makes blind says so under an unticked box (not when the tick is set too); the markup is fixed text',
            tk.on === TICK.replace('id="wbBlindTick" >', 'id="wbBlindTick" checked>') && tk.yes === TICK && tk.sheet === TICK + '<div class="muted" style="margin:-4px 0 6px; font-size:10.5px;">Blind by its character&rsquo;s sheet.</div>' && tk.both === tk.on && [tk.on, tk.sheet].every(h => risks(h).length === 0), j(tk));
        const scS = { fieldById: (sys, id) => (id === 'f_deaf' ? { id: 'f_deaf', label: T } : id === 'f_gone' ? { id: 'f_gone', label: '' } : null) };
        const offList = [{ id: 'sn_aaaaaaaa', name: 'Eyes', unit: 'ft', eyes: true }, { id: 'sn_bbbbbbbb', name: 'Hearing', unit: 'm', off: { field: 'f_deaf' } }, { id: 'sn_cccccccc', name: 'Smell', off: { field: 'f_gone' } }];
        const offTs = { full: [], blind: true, offs: [{ id: 'sn_aaaaaaaa', n: 60, cells: 12, from: 'n', why: 'blind' }, { id: 'sn_bbbbbbbb', n: 30, cells: 6, from: 'field', why: 'off' }, { id: 'sn_cccccccc', n: 5, cells: 5, from: 'token', why: 'off' }] };
        const hOff = mkSf(campS, { list: offList, ts: offTs, sc: scS }).sensesFieldHtml({ id: 'b5', isChar: true, senses: [{ id: 'sn_cccccccc', n: 5 }] }, { id: 'm1' }), hOffNo = mkSf(campS, { list: offList, ts: offTs }).sensesFieldHtml({ id: 'b5', isChar: true }, { id: 'm1' });
        const saysOff = h => Array.from(h.matchAll(/<div class="muted" style="margin:-1px 0 4px; font-size:10.5px;">([^<]*)<\/div>/g)).map(m => m[1]);
        check('senses block (S3): a sense held but off says so where "Not held" would mislead — one of the eyes "off while blind", one switched off "off," and its switch\'s label (escaped: a hostile label is text), or "its switch" where it cannot be named; the Blind note and tick follow the rows',
            j(saysOff(hOff)) === j(['60 ft, the system’s: off while blind', '30 m, from the sheet: off, ' + escS(T), '5 yd, this token’s own: off, its switch']) && risks(hOff).length === 0 && hOff.indexOf(T) < 0
            && j(saysOff(hOffNo)) === j(['60 ft, the system’s: off while blind', '30 m, from the sheet: off, its switch', '5 yd, this token’s own: off, its switch']) && /<\/div><div class="field check-row"><input type="checkbox" id="wbBlindTick" > <label for="wbBlindTick"[^>]*>Blind<\/label><\/div><div class="muted"[^>]*>Blind by its character&rsquo;s sheet\.<\/div>$/.test(hOff), j([saysOff(hOff), saysOff(hOffNo)]));
        // senses S4a-2: mark senses in a token's Properties, and the ticks of the senses that never mark it
        const mkSL = [{ id: 'sn_hear0001', name: T, unit: 'ft', grade: 'mark' }, { id: 'sn_trem0001', name: 'Tremor', grade: 'mark' }];
        const o4 = { list: [{ id: 'sn_aaaaaaaa', name: 'Truesight', unit: 'ft' }], marks: mkSL, ts: { full: [{ id: 'sn_aaaaaaaa', n: 5, cells: 1, from: 'n' }], marks: [{ id: 'sn_hear0001', n: 30, cells: 6, from: 'n' }] } };
        const h4 = mkSf(campS, o4).sensesFieldHtml({ id: 'z', isChar: true, unsensed: ['sn_trem0001'] }, { id: 'm1' }), h4all = mkSf(campS, o4).sensesFieldHtml({ id: 'z', isChar: true, unsensed: true }, { id: 'm1' });
        const rows4 = Array.from(h4.matchAll(/<span style="flex:1 1 120px; min-width:0;">([^<]*)<\/span><input type="number" class="wb-sense-ov" data-si="([^"]*)"/g)).map(m => [m[1], m[2]]);
        const unTicks = h => Array.from(h.matchAll(/<div class="field check-row" style="margin-bottom:4px;"><input type="checkbox" class="wb-unsensed" id="wbUnsensed(\d)" data-mi="\1" (checked)?> <label for="wbUnsensed\1">([^<]*)<\/label><\/div>/g)).map(m => [m[1], !!m[2], m[3]]);
        check('senses block (S4a-2): a token\'s Properties list the mark senses after the full ones (each with its range as the token has it), then one tick per mark sense under "Never shown as a mark by" (names escaped, ticked by the token\'s own list or all of them for true), with the sentence that a sense that shows everything still shows it; nothing that can run',
            j(rows4) === j([['Truesight', '0'], [escS(T), '1'], ['Tremor', '2']]) && h4.indexOf('30 ft, the system’s: 6 cells on this map') > 0 && j(unTicks(h4)) === j([['0', false, escS(T)], ['1', true, 'Tremor']]) && j(unTicks(h4all).map(t => t[1])) === j([true, true])
            && h4.indexOf('A sense that shows everything in range still shows this token; hide the token to keep it from those.') > 0 && risks(h4).length === 0 && h4.indexOf(T) < 0 && unTicks(mkSf(campS, { list: [{ id: 'sn_aaaaaaaa', name: 'X' }] }).sensesFieldHtml({ id: 'y', isChar: true }, { id: 'm1' })).length === 0, j([rows4, unTicks(h4)]));
        const SU = mkSf(campS, { list: [], marks: mkSL }), tU = { id: 'u', isChar: true, unsensed: true };
        SU.setTokenUnsensed(tU, '0', false); const u1 = j(tU.unsensed); SU.setTokenUnsensed(tU, '1', false); const u2 = 'unsensed' in tU; SU.setTokenUnsensed(tU, '0', true); const u3 = j(tU.unsensed); SU.setTokenUnsensed(tU, '0', 'yes'); const u4 = 'unsensed' in tU;
        const uSaves = SU.calls.saves, uOdd = ['2', '-1', '01', 'x', 0, null].map(mi => { const w = { id: 'o', isChar: true, unsensed: ['sn_hear0001'] }; SU.setTokenUnsensed(w, mi, true); return j(w.unsensed); });
        const SS4 = mkSf(campS, { list: [{ id: 'sn_aaaaaaaa', name: 'Truesight' }], marks: mkSL }), tS4 = { id: 's', isChar: true }; SS4.setTokenSense(tS4, '1', '40');
        check('senses set (S4a-2): a tick of "Never shown as a mark by" takes that sense off or puts it back (every sense, true, becomes the others\' ids; the last taken away leaves no key; anything but true takes it away); a place no mark sense holds changes nothing and saves nothing; a token\'s own range reaches a mark sense by its place after the full ones',
            u1 === j(['sn_trem0001']) && u2 === false && u3 === j(['sn_hear0001']) && u4 === false && SU.calls.saves === 4 && uOdd.every(u => u === j(['sn_hear0001'])) && SU.calls.saves === uSaves && j(tS4.senses) === j([{ id: 'sn_hear0001', n: 40 }]), j([u1, u2, u3, u4, uOdd, tS4.senses]));
        check('senses block (S4a-2, inspector.js): the ticks are wired to setTokenUnsensed by their place',
            /inspector\.querySelectorAll\('\.wb-unsensed'\)\.forEach\(function\(el\) \{ el\.addEventListener\('change', function\(\) \{ setTokenUnsensed\(w, this\.dataset\.mi, this\.checked\); \}\); \}\);/.test(inspS) && (inspS.match(/setTokenUnsensed\(/g) || []).length === 2);
        // senses S7a: a null area's ticks in its Properties, their handler, and a sense that fails there on a token's Properties
        const nlO = { list: [{ id: 'sn_aaaaaaaa', name: T }], marks: [{ id: 'sn_hear0001', name: 'Hear' }] }, nulTicks = h => Array.from(h.matchAll(/<div class="field check-row" style="margin-bottom:4px;"><input type="checkbox" class="wb-null" id="wbNull(\d)" data-ni="\1" (checked)?> <label for="wbNull\1">([^<]*)<\/label><\/div>/g)).map(m => [m[1], !!m[2], m[3]]);
        const hN = mkSf(campS, nlO).nullsFieldHtml({ id: 'z', type: 'rect', nulls: ['sn_hear0001', 'bad'] }), hN0 = mkSf(campS, { list: [] }).nullsFieldHtml({ id: 'z', type: 'rect' }), hNc = mkSf(campS, Object.assign({ noCore: true }, nlO)).nullsFieldHtml({ id: 'z', type: 'rect' });
        check('senses block (S7a): a piece\'s Properties tick the senses that fail for a token on it — one tick per sense of the system, full ones first, names escaped, ticked by its own list; the sentence that it works hidden; nothing with no sense or no cleaner; nothing that can run',
            j(nulTicks(hN)) === j([['0', false, escS(T)], ['1', true, 'Hear']]) && hN.indexOf('Senses fail here') > 0 && hN.indexOf('It works hidden too: players never get it, and a hidden one leaves nothing on their map.') > 0 && hN.indexOf(T) < 0 && risks(hN).length === 0 && hN0 === '' && hNc === '', j(nulTicks(hN)));
        const SN = mkSf(campS, nlO), zN = { id: 'z', type: 'rect', nulls: ['sn_hear0001'] };
        SN.setItemNulls(zN, '0', true); const n1 = j(zN.nulls); SN.setItemNulls(zN, '1', false); const n2 = j(zN.nulls); SN.setItemNulls(zN, '0', 'yes'); const n3 = 'nulls' in zN; const nSaves = SN.calls.saves;
        const nOdd = ['2', '-1', '01', 'x', 0, null].map(ni => { const w = { id: 'o', nulls: ['sn_hear0001'] }; SN.setItemNulls(w, ni, true); return j(w.nulls); });
        check('senses set (S7a): a tick takes a sense into a piece\'s null list or out of it (anything but true takes it out; the last out leaves no key); a place no sense holds changes nothing and saves nothing; the ticks are wired by their place; a sense that fails there reads so on a token\'s Properties and its menu',
            n1 === j(['sn_hear0001', 'sn_aaaaaaaa']) && n2 === j(['sn_aaaaaaaa']) && n3 === false && nSaves === 3 && nOdd.every(u => u === j(['sn_hear0001'])) && SN.calls.saves === nSaves
            && /inspector\.querySelectorAll\('\.wb-null'\)\.forEach\(function\(el\) \{ el\.addEventListener\('change', function\(\) \{ setItemNulls\(w, this\.dataset\.ni, this\.checked\); \}\); \}\);/.test(inspS)
            && /\(\['rect','hexagon','circle','diamond','image'\]\.indexOf\(w\.type\) >= 0 && !w\.isChar && !w\.waiting && !w\.gmNoteFor && window\.wpCanPersistLocal && window\.wpCanPersistLocal\(\) \? nullsFieldHtml\(w\) : ''\)/.test(inspS)
            && mkSf(campS, { list: [{ id: 'sn_aaaaaaaa', name: 'Truesight', unit: 'ft' }], ts: { full: [], offs: [{ id: 'sn_aaaaaaaa', n: 30, cells: 6, from: 'n', why: 'null' }] } }).sensesFieldHtml({ id: 'z', isChar: true }, { id: 'm1' }).indexOf('30 ft, the system’s: fails here (a null area)') > 0, j([n1, n2, n3, nOdd]));
        // item 19 H1: a piece's Height box (inspector.js sliced by its heightbox markers, run for real): only a number the cleaner keeps, in the viewer's unit
        const hbSrc = slice('inspector.js', 'heightbox').trim().replace(/\+\s*$/, ''), HB = new Function('w', 'window', "'use strict';\nreturn " + hbSrc + ';');
        const hbWin = unit => ({ wpFogCore: FCs, wpStance: { lenUnit: () => unit, ydOut: v => unit === 'm' ? v * 0.9144 : v } });
        const hb1 = HB({ id: 'a', type: 'rect', height: 2, blocksSight: true }, hbWin('yd')), hb2 = HB({ id: 'a', type: 'rect', height: 2 }, hbWin('m')), hb3 = HB({ id: 'a', type: 'image', height: '"><img src=x onerror=alert(1)>' }, hbWin('yd')), hb4 = HB({ id: 'a', type: 'path', height: 1e9 }, hbWin('yd'));
        const hbNone = [HB({ id: 'a', type: 'rect', hidden: true, height: 2 }, hbWin('yd')), HB({ id: 'a', type: 'image', isChar: true, height: 2 }, hbWin('yd')), HB({ id: 'a', type: 'text', height: 2 }, hbWin('yd')), HB({ id: 'a', type: 'circle', waiting: 1 }, hbWin('yd'))], hb0 = HB({ id: 'a', type: 'rect', height: 2 }, {});
        const hbVal = h => (h.match(/id="wbHeight"[^>]*value="([^"]*)"/) || [])[1];
        check('item 19 H1 a piece\'s Height box (inspector.js, run for real): on a shape, an image or a pen line, never a hidden piece, a token, a waiting token or a text; its value only a number the cleaner keeps, in the viewer\'s unit (2 yards reads 1.83 in metres; past 10,000 reads 10,000; a hostile value reads empty, none of it in the markup); its words fixed (a wall full height, a see-over piece 1 yard); nothing without the cleaner',
            hbVal(hb1) === '2' && /Height <span class="muted">\(yards\)<\/span>/.test(hb1) && /placeholder="full height"/.test(hb1) && hbVal(hb2) === '1.83' && /\(metres\)/.test(hb2) && /placeholder="0\.9"/.test(hb2) && hbVal(hb3) === '' && !/<img|onerror|alert/.test(hb3) && hbVal(hb4) === '10000'
            && hbNone.every(h => h === '') && hbVal(hb0) === '', j([hbVal(hb1), hbVal(hb2), hbVal(hb3), hbVal(hb4), hbNone]));
        const hbTip = h => (h.match(/id="wbHeight"[^>]*title="([^"]*)"/) || [])[1] || '';
        check('item 19b a piece\'s Height tooltip says what Height does now (inspector.js, run for real): cover by height and the fog under Height clears low cover (from below, a creature no higher than the piece is hidden), and the True 3D sightline (a line stopped only where it runs at or below the piece, a low wall seen over); fixed words, the same on every piece, no markup and no quote in them',
            /Height clears low cover/.test(hbTip(hb1)) && /in the fog/.test(hbTip(hb1)) && /from below/.test(hbTip(hb1)) && /True 3D sightline/.test(hbTip(hb1)) && /at or below/.test(hbTip(hb1)) && /no cover/.test(hbTip(hb1)) && /Empty: a wall is full height, a see-over piece 1 yard$/.test(hbTip(hb1))
            && hbTip(hb1) === hbTip(hb2) && hbTip(hb1) === hbTip(hb3) && !/[<>']/.test(hbTip(hb1)) && (hb1.match(/title="/g) || []).length === 1, hbTip(hb1));
        // item 19b H5: a piece's Ground height row (inspector.js sliced by its groundbox markers, run for real): only a number the cleaner keeps, in the viewer's unit; never on a token
        const mkGr = win => { const calls = { saves: 0, renders: 0, insp: 0, fog: 0, blasts: 0 }, w0 = Object.assign({}, win, win.fog ? { wpFog: { invalidateVision: () => { calls.fog++; }, redraw: () => { calls.fog++; } }, wpRefreshBlasts: () => { calls.blasts++; } } : {});
            let api; try { api = new Function('env', "'use strict';\nvar window = env.window, save = env.save, render = env.render, renderInspector = env.renderInspector;\n" + slice('inspector.js', 'groundbox') + '\nreturn { groundFieldHtml: groundFieldHtml, setItemGround: setItemGround };')({ window: w0, save: () => { calls.saves++; }, render: () => { calls.renders++; }, renderInspector: () => { calls.insp++; } }); }
            catch (e) { api = { groundFieldHtml: () => 'missing', setItemGround: () => {} }; }
            api.calls = calls; return api; };
        const grWin = unit => ({ wpFogCore: FCs, wpStance: { lenUnit: () => unit, ydOut: v => (unit === 'm' ? v * 0.9144 : v), ydIn: v => { const n = Number(v); return !isFinite(n) ? NaN : unit === 'm' ? n / 0.9144 : n; } }, fog: true });
        const GR = mkGr(grWin('yd')), GRm = mkGr(grWin('m')), GR0 = mkGr({}), grVal = h => (String(h).match(/id="wbGround"[^>]*value="([^"]*)"/) || [])[1];
        const gr1 = GR.groundFieldHtml({ id: 'a', type: 'rect', ground: 3 }), gr2 = GRm.groundFieldHtml({ id: 'a', type: 'image', ground: -2 }), gr3 = GR.groundFieldHtml({ id: 'a', type: 'circle', ground: '"><img src=x onerror=alert(1)>' }), gr4 = GR.groundFieldHtml({ id: 'a', type: 'hexagon', ground: -1e9 }),
            gr5 = GR.groundFieldHtml({ id: 'a', type: 'path', tip: 'fill', ground: 2.5 }), gr6 = GR.groundFieldHtml({ id: 'a', type: 'diamond', hidden: true, ground: 4 }), gr7 = GR.groundFieldHtml(Object.assign(Object.create({ ground: 9 }), { id: 'a', type: 'rect' }));
        const grNone = [{ type: 'rect', isChar: true }, { type: 'image', isChar: true }, { type: 'circle', waiting: 1 }, { type: 'text' }, { type: 'trigger' }, { type: 'light' }, { type: 'path' }, { type: 'rect', gmNoteFor: 't' }, {}].map(o => GR.groundFieldHtml(Object.assign({ id: 'n', ground: 5 }, o))).concat([GR.groundFieldHtml(null)]);
        const gwS = { id: 'z', type: 'rect' }, grSet = ['3', '-2.346', '0', '', 'x', '1e9', ' 4 ', -7, null, undefined, '"><img>'].map(v => { GR.setItemGround(gwS, v); return 'ground' in gwS ? gwS.ground : 'none'; });
        const gwM = { id: 'z', type: 'rect' }; GRm.setItemGround(gwM, '3'); const grTok = [{ id: 't', type: 'image', isChar: true, ground: 5 }, { id: 't', type: 'text', ground: 5 }, { id: 't', type: 'path', ground: 5 }].map(w => { GR.setItemGround(w, '8'); return 'ground' in w; });
        const gwN = { id: 'z', type: 'rect', ground: 5 }; GR0.setItemGround(gwN, '8');
        const grLine = (inspS.match(/\n[^\n]*groundFieldHtml\(w\)\+[^\n]*\n/) || [''])[0];
        check('item 19b H5 a piece\'s Ground height row (inspector.js, run for real): on a shape, an image or a filled region, hidden or not (a hidden one says who reads it), never a token, a waiting token, a GM-note card, a pen line, a text, a trigger or a light; its value only a number the cleaner keeps and the piece itself holds, in the viewer\'s unit (a 2-yard pit reads -1.83 in metres; past 1000 reads 1000; a hostile value reads empty, none of it in the markup); nothing without the cleaner',
            grVal(gr1) === '3' && /Ground height <span class="muted">\(yards; a pit is negative\)<\/span>/.test(gr1) && grVal(gr2) === '-1.83' && /\(metres; a pit is negative\)/.test(gr2) && grVal(gr3) === '' && !/<img|onerror|alert/.test(gr3) && grVal(gr4) === '-1000' && grVal(gr5) === '2.5'
            && grVal(gr6) === '4' && /While this piece is hidden, nothing worked out for players reads its ground &mdash; their screens, their rolls, a thrown blast, what the fog shows or hides for them; your own screen, your own rolls and your blast tool do\./.test(gr6) && !/While this piece is hidden/.test(gr1) && grVal(gr7) === '' && grNone.every(h => h === '') && [gr1, gr2, gr3, gr4, gr5, gr6].every(h => risks(h).length === 0) && grVal(GR0.groundFieldHtml({ id: 'a', type: 'rect', ground: 3 })) === '',
            j([grVal(gr1), grVal(gr2), grVal(gr3), grVal(gr4), grVal(gr5), grVal(gr6), grVal(gr7), grNone]));
        check('item 19b H5 a piece\'s Ground height is set from its box (run for real): what the GM typed, in their own unit, kept in yards as the cleaner keeps it (3 metres is 3.28 yards; past 1000 is 1000; a pit below 0), or taken away (empty, 0, a word, markup); never onto a token, a text or a pen line, nor without the cleaner; each change saved and redrawn, the fog and the rulers told; the row and its box wired',
            j(grSet) === j([3, -2.35, 'none', 'none', 'none', 1000, 4, -7, 'none', 'none', 'none']) && gwM.ground === 3.28 && j(grTok) === j([false, false, false]) && !('ground' in gwN)
            && GR.calls.saves === 14 && GR.calls.renders === 14 && GR.calls.insp === 14 && GR.calls.fog === 28 && GR.calls.blasts === 14
            && /groundFieldHtml\(w\)\+   \/\/ item 19b H5/.test(grLine) && inspS.includes("if (wbGround) wbGround.addEventListener('change', function() { setItemGround(w, this.value); });"), j([grSet, gwM.ground, grTok, GR.calls, grLine]));
        // difficult terrain T1: a shape's Properties row (its tick and its cost), sliced by its terrainfield markers and run for real
        const mkTr = win => { const calls = { saves: 0, renders: 0, insp: 0 }; const api = new Function('env', "'use strict';\nvar window = env.window, save = env.save, render = env.render, renderInspector = env.renderInspector;\n" + slice('inspector.js', 'terrainfield') + '\nreturn { terrainFieldHtml: terrainFieldHtml, setItemTerrain: setItemTerrain };')({ window: win, save: () => { calls.saves++; }, render: () => { calls.renders++; }, renderInspector: () => { calls.insp++; } }); api.calls = calls; return api; };
        const TR = mkTr({ wpFogCore: FCs }), trH = [3, '"><img src=x onerror=alert(1)>', 1e9, 2.6, undefined, 1].map(t => TR.terrainFieldHtml({ id: 'z', type: 'rect', terrain: t })), trH0 = mkTr({}).terrainFieldHtml({ id: 'z', type: 'rect', terrain: 3 });
        const trBits = trH.map(h => [/id="wbTerrain" checked>/.test(h), (h.match(/id="wbTerrainCost" min="2" max="10" step="1" value="(\d+)"/) || [])[1], / disabled /.test(h)]);
        const tw = {}, trSet = [[true, '4'], [true, 'x'], [true, '99'], [true, '1'], [false, '4'], ['yes', '4'], [true, 7.6]].map(([on, v]) => { TR.setItemTerrain(tw, on, v); return 'terrain' in tw ? tw.terrain : 'none'; });
        const trLine = (inspS.match(/\n[^\n]*terrainFieldHtml\(w\) : ''\)[^\n]*\n/) || [''])[0];
        check('terrain T1: a shape\'s Properties hold a Difficult terrain tick and its cost — ticked, and the box a number, only as the cleaner keeps it (a hostile value reads unticked at 2, past 10 reads 10), no campaign text in its markup, none without the cleaner; on the four shapes, never a token, a waiting token or a hidden piece; the GM\'s tick or cost sets the cost 2 to 10 (a word reads 2) or takes it away, saved and redrawn',
            j(trBits) === j([[true, '3', false], [false, '2', true], [true, '10', false], [true, '3', false], [false, '2', true], [false, '2', true]]) && trH.every(h => !/<img|onerror|alert/.test(h)) && /id="wbTerrain" >/.test(trH0) && / disabled /.test(trH0)
            && j(trSet) === j([4, 2, 10, 2, 'none', 'none', 8]) && TR.calls.saves === 7 && TR.calls.renders === 7 && TR.calls.insp === 7
            && /\(\['rect','hexagon','circle','diamond'\]\.indexOf\(w\.type\) >= 0 && !w\.hidden && !w\.isChar && !w\.waiting \? terrainFieldHtml\(w\) : ''\)\+   \/\/ difficult terrain T1/.test(trLine)
            && inspS.includes("if (_el_wbTerrain) _el_wbTerrain.addEventListener('change', function() { setItemTerrain(w, this.checked, _el_wbTerrainCost ? _el_wbTerrainCost.value : 2); });")
            && inspS.includes("if (_el_wbTerrainCost) _el_wbTerrainCost.addEventListener('change', function() { setItemTerrain(w, true, this.value); });"), j([trBits, trSet, TR.calls]));
        const smLine = (inspS.match(/\n[^\n]*id="wbSmoke"[^\n]*\n/) || [''])[0], smH = (inspS.match(/\n[^\n]*_el_wbSmoke\.addEventListener[^\n]*\n/) || [''])[0];
        check('senses S7b: a shape\'s Properties hold a Smoke tick — checked only by true, no campaign text in its markup, on a shape the fog reads (never a token, a waiting token or a hidden piece); its handler sets smoke as true or takes it away and redraws the fog',
            /\(\['rect','hexagon','circle','diamond'\]\.indexOf\(w\.type\) >= 0 && !w\.hidden && !w\.isChar && !w\.waiting \? '<div class="field check-row"><input type="checkbox" id="wbSmoke" '\+\(w\.smoke===true\?'checked':''\)\+'> <label for="wbSmoke">Smoke \(hides what is in it and past it\)<\/label><\/div>/.test(smLine)
            && (smLine.match(/'\+/g) || []).length === 1 && /function\(\) \{ if \(this\.checked === true\) w\.smoke = true; else delete w\.smoke; save\(\); render\(\); renderInspector\(\); if \(window\.wpFog\) \{ window\.wpFog\.invalidateVision\(\); window\.wpFog\.redraw\(\); \} \}\);/.test(smH), smLine.slice(0, 160));
        const SB = mkSf(campS, { list: [] }), tB1 = { id: 't', isChar: true }; SB.setTokenBlind(tB1, true); const bl1 = tB1.blind; SB.setTokenBlind(tB1, false); const bl2 = 'blind' in tB1; SB.setTokenBlind(tB1, 'yes'); const bl3 = 'blind' in tB1;
        const noFogB = mkSf(campS, { list: [], noFog: true }), tB2 = { id: 't2', isChar: true }; noFogB.setTokenBlind(tB2, true);
        check('senses set (S3): the Blind tick sets true or takes the key away (anything but true takes it away), saving, redrawing the board, the panel and the fog each time; with no fog module it still saves',
            bl1 === true && bl2 === false && bl3 === false && j(SB.calls) === j({ saves: 3, renders: 3, inspectors: 3, vision: 3, redraws: 3 }) && tB2.blind === true && noFogB.calls.saves === 1, j([SB.calls, noFogB.calls]));
        // setTokenSense, run for real against the real fogcore
        const SS = mkSf(campS, { list: listS.slice(0, 3) }), tokT = { id: 't1', isChar: true, senses: [{ id: 'sn_zzzzzzzz', n: 5 }, 'junk', { id: 'sn_bbbbbbbb', n: 7 }] };
        SS.setTokenSense(tokT, '0', '12'); const st1 = j(tokT.senses); SS.setTokenSense(tokT, '1', ' 0 '); const st2 = j(tokT.senses); SS.setTokenSense(tokT, '2', '1e9'); SS.setTokenSense(tokT, '0', '-4'); const st3 = j(tokT.senses);
        SS.setTokenSense(tokT, '0', ''); SS.setTokenSense(tokT, '1', '   '); SS.setTokenSense(tokT, '2', 'abc'); const st4 = j(tokT.senses); const c4 = j(SS.calls);
        check('senses set: a token\'s own range is written by the sense\'s place in the list, cleaned (clamped to 0 to 100000, a 0 kept), the sense\'s entry replaced and the others kept as the cleaner leaves them; empty (or no number) gives the sheet\'s back; each saves, redraws the board, the panel and the fog',
            st1 === j([{ id: 'sn_zzzzzzzz', n: 5 }, { id: 'sn_bbbbbbbb', n: 7 }, { id: 'sn_aaaaaaaa', n: 12 }]) && st2 === j([{ id: 'sn_zzzzzzzz', n: 5 }, { id: 'sn_aaaaaaaa', n: 12 }, { id: 'sn_bbbbbbbb', n: 0 }])
            && st3 === j([{ id: 'sn_zzzzzzzz', n: 5 }, { id: 'sn_bbbbbbbb', n: 0 }, { id: 'sn_cccccccc', n: 100000 }, { id: 'sn_aaaaaaaa', n: 0 }]) && st4 === j([{ id: 'sn_zzzzzzzz', n: 5 }])
            && j(SS.calls) === j({ saves: 7, renders: 7, inspectors: 7, vision: 7, redraws: 7 }), j([st1, st2, st3, st4, c4]));
        const tokU = { id: 'u', isChar: true, senses: [{ id: 'sn_aaaaaaaa', n: 3 }] }; SS.setTokenSense(tokU, '0', ''); const goneU = 'senses' in tokU;
        const nonText = [null, undefined, 7, {}].map(v => { const w = { id: 'v', isChar: true, senses: [{ id: 'sn_aaaaaaaa', n: 3 }, { id: 'sn_bbbbbbbb', n: 2 }] }; let threw = false; try { SS.setTokenSense(w, '0', v); } catch (e) { threw = true; } return [threw, j(w.senses)]; });
        const noCampS = mkSf(null, { list: listS }), tokNc = { id: 'n', isChar: true }; noCampS.setTokenSense(tokNc, '0', '5'); const noFogS = mkSf(campS, { list: listS, noFog: true }); noFogS.setTokenSense(tokNc, '0', '5'); const noCoreS = mkSf(campS, { list: listS, noCore: true }); noCoreS.setTokenSense(tokNc, '0', '5');
        check('senses set: a value that is no text gives the sheet\'s back for that sense alone; with no campaign, fog module or cleaner nothing is written or saved',
            nonText.every(r => r[0] === false && r[1] === j([{ id: 'sn_bbbbbbbb', n: 2 }])) && !('senses' in tokNc) && [noCampS, noFogS, noCoreS].every(K => K.calls.saves === 0 && K.calls.inspectors === 0), j([nonText, noCampS.calls]));
        const bareU = { id: 'b', isChar: true }; SS.setTokenSense(bareU, '1', ''); const bareNone = 'senses' in bareU;
        const sOdd = SS.calls.saves, iOdd = SS.calls.inspectors;
        const oddS = ['3', '8', '-1', '1.5', ' 0', '00', '0x1', '__proto__', 'constructor', 'length', '', '1e0', 0, 1, null, undefined, {}, []].map(si => { const w = { id: 'o', isChar: true, senses: [{ id: 'sn_aaaaaaaa', n: 3 }] }; let threw = false; try { SS.setTokenSense(w, si, '9'); } catch (e) { threw = true; } return [String(si), threw, j(w.senses)]; });
        check('senses set: the last one taken away leaves the token with no ranges at all (the key gone), and none is added to a token that had none; only a place in the list written as one digit picks a sense — past the list, negative, fractional, padded, another way of writing a number, a prototype\'s name or no text changes nothing and saves nothing, the panel drawn afresh',
            goneU === false && bareNone === false && oddS.every(r => r[1] === false && r[2] === j([{ id: 'sn_aaaaaaaa', n: 3 }])) && SS.calls.saves === sOdd && SS.calls.inspectors === iOdd + oddS.length, j([goneU, bareNone, oddS]));
        check('senses block (inspector.js): a character token\'s Properties show it after the Light block, never a waiting token\'s and only where this machine saves (the GM\'s), its number boxes wired to setTokenSense by their place',
            /lightFieldHtml\(w, L, lightPresetsNow\(\)\);\r?\n\s*\}\)\(\) : ''\)\+\r?\n\s*\(w\.isChar && !w\.waiting && window\.wpCanPersistLocal && window\.wpCanPersistLocal\(\) \? sensesFieldHtml\(w, activeMap\) : ''\)\+/.test(inspS)
            && /inspector\.querySelectorAll\('\.wb-sense-ov'\)\.forEach\(function\(el\) \{ el\.addEventListener\('change', function\(\) \{ setTokenSense\(w, this\.dataset\.si, this\.value\); \}\); \}\);/.test(inspS) && (inspS.match(/sensesFieldHtml\(/g) || []).length === 2 && (inspS.match(/setTokenSense\(/g) || []).length === 2
            && /\nwindow\.wpFog = \{[^]*?\n    tokenSenses: tokenSenses, campSenses: campSenses,[^\n]*\n[^]*?\n\};/.test(read('fog.js').replace(/\r\n/g, '\n'))
            && /var _el_wbBT = document\.getElementById\('wbBlindTick'\);\r?\n\s*if \(_el_wbBT\) _el_wbBT\.addEventListener\('change', function\(\) \{ setTokenBlind\(w, this\.checked\); \}\);/.test(inspS) && (inspS.match(/setTokenBlind\(/g) || []).length === 2);
    }
    /* ---- Senses S3: a token's senses as one line on its menu (whiteboard.js tokenSensesLine), and the fog's blind caption drawn as text ---- */
    {
        const j = JSON.stringify, inspL3 = read('inspector.js'), escL3 = (l => (l ? new Function(l[0] + '\nreturn esc;')() : SC.esc))(/\n  function esc\(s\)\{[^\n]*\}\n/.exec(inspL3)), lineSrc = slice('whiteboard.js', 'senseline');
        const mkLine = o => { const win = { wpFog: o.noFog ? undefined : { tokenSenses: (t, m, c, waived) => { o.asked = [t.id, m && m.id, waived]; return o.ts; }, campSenses: () => o.list || [], campMarkSenses: () => o.marks || [] } }; if (o.sc) win.wpSystemCore = o.sc;
            return new Function('esc', 'window', 'getActiveCampaign', 'getActiveMap', "'use strict';\n" + lineSrc + '\nreturn tokenSensesLine;')(escL3, win, () => (o.noCamp ? null : { id: 'c', system: {} }), () => (o.noMap ? null : { id: 'm' })); };
        const lList = [{ id: 'sn_aaaaaaaa', name: T, unit: 'ft' }, { id: 'sn_bbbbbbbb', name: P }, { id: 'sn_cccccccc', name: 'Hear', unit: 'm', off: { field: 'f_deaf' } }, { id: 'sn_dddddddd', name: 'Dark', unit: 'cells', eyes: true }, { id: 'sn_eeeeeeee', name: 'Smell', off: { field: 'f_nolab' } }];
        const lTs = { full: [{ id: 'sn_aaaaaaaa', n: 30 }, { id: 'sn_bbbbbbbb', n: 2 }, { id: 'sn_zzzzzzzz', n: 4 }], offs: [{ id: 'sn_cccccccc', n: 9, why: 'off' }, { id: 'sn_dddddddd', n: 12, why: 'blind' }, { id: 'sn_eeeeeeee', n: 5, why: 'off' }], blind: true };
        const lSc = { fieldById: (sys, id) => (id === 'f_deaf' ? { id: 'f_deaf', label: T } : id === 'f_nolab' ? { id: 'f_nolab', label: '' } : null) };
        const oA = { list: lList, ts: lTs, sc: lSc }, hLine = mkLine(oA)({ id: 'tk', isChar: true, ownerId: 'u_p' });
        const LINE_A = '<div class="menu-item cm-senses" style="color:var(--dim); cursor:default; white-space:normal; max-width:280px; font-size:11px;">Senses: ';
        check('senses line (S3): a token\'s menu names its senses in one line — Blind, each working sense with its range and unit (yards for none), each held but off with why (off while blind, or off and its switch\'s label, none where it has no label) — every name and label escaped, nothing that can run; a sense the list lacks is left out; a player\'s token reads by its own rule',
            hLine === LINE_A + escL3('Blind · ' + T + ' 30 ft · ' + P + ' 2 yd · Hear 9 m: off, ' + T + ' · Dark 12 cells: off while blind · Smell 5 yd: off') + '</div>' && risks(hLine).length === 0 && hLine.indexOf(T) < 0 && hLine.indexOf(P) < 0 && j(oA.asked) === j(['tk', 'm', false]), [hLine, oA.asked]);
        const lineMk = mkLine({ list: lList.slice(0, 1), marks: [{ id: 'sn_mk000001', name: 'Hearing', unit: 'cells', grade: 'mark' }], ts: { full: [{ id: 'sn_aaaaaaaa', n: 30 }], marks: [{ id: 'sn_mk000001', n: 12 }] } })({ id: 'tk', isChar: true, ownerId: 'u_p' });
        check('senses line (S4a-2): a token\'s menu names its mark senses too, after the full ones', lineMk === LINE_A + escL3(T + ' 30 ft · Hearing 12 cells') + '</div>', lineMk);
        const lineNul = mkLine({ list: lList.slice(0, 1), ts: { full: [], offs: [{ id: 'sn_aaaaaaaa', n: 30, why: 'null' }] } })({ id: 'tk', isChar: true, ownerId: 'u_p' });
        check('senses line (S7a): a sense a null area switches off reads "fails here"', lineNul === LINE_A + escL3(T + ' 30 ft: fails here') + '</div>', lineNul);
        const oN = { list: lList, ts: { full: [] } }, oNpc = Object.assign({}, oA), npcLine = mkLine(oNpc)({ id: 'np', isChar: true });
        const lineNone = [mkLine(oN)({ id: 'a', isChar: true, ownerId: 'u_p' }), mkLine(oA)({ id: 'w', isChar: true, waiting: 1 }), mkLine(oA)({ id: 'r', type: 'rect' }), mkLine(Object.assign({}, oA, { noFog: true }))({ id: 'a', isChar: true }), mkLine(Object.assign({}, oA, { noCamp: true }))({ id: 'a', isChar: true }), mkLine(Object.assign({}, oA, { noMap: true }))({ id: 'a', isChar: true }), mkLine(oA)(null)];
        const oNo = Object.assign({}, oA); delete oNo.sc; const noSc = mkLine(oNo)({ id: 'a', isChar: true, ownerId: 'u_p' });
        check('senses line (S3): nothing for a token neither blind nor holding a sense, a waiting token, an item that is no character, with no fog module, campaign or map; an NPC token reads with the rule waived; with no system module a switch goes unnamed',
            lineNone.every(h => h === '') && npcLine.indexOf('Blind') > 0 && oNpc.asked[2] === true && noSc.indexOf('Hear 9 m: off ·') > 0, j([lineNone, noSc, oNpc.asked]));
        const fogL3 = read('fog.js').replace(/\r\n/g, '\n'), dsA = fogL3.indexOf('function drawSenseCaptions('), dsS = dsA >= 0 ? fogL3.slice(dsA, fogL3.indexOf('\n}\n', dsA)) : '';
        check('senses caption (S3, fog.js): the blind caption is drawn as text (fillText) and nothing else, and the menu line is built from escaped text alone; the GM\'s token menu shows the line after its stance rows',
            /\n                html \+= stanceMenuHtml\(firstItem\);\r?\n                html \+= tokenSensesLine\(firstItem\);/.test(read('whiteboard.js')) && !!dsS && /ctx\.fillText\(t, cx, cy \+ 0\.5, 346\)/.test(dsS) && !/innerHTML|insertAdjacentHTML|outerHTML/.test(dsS) && !/innerHTML|insertAdjacentHTML|outerHTML/.test(lineSrc) && (lineSrc.match(/esc\(/g) || []).length === 1);
    }
    /* ---- Lighting L5: a player's own light — a preset's name comes from a system file, a light's own name from the host's map, a player's and a token's name from the wire ---- */
    {
        const j = JSON.stringify, FCo = await import(modUrl('fogcore.js')), SYo = await import(modUrl('systemcore.js'));
        const wbO = read('whiteboard.js'), inspO = read('inspector.js'), netO = read('net.js'), ioO = read('io.js');
        const escLineO = /\n  function esc\(s\)\{[^\n]*\}\n/.exec(inspO), escO = escLineO ? new Function(escLineO[0] + '\nreturn esc;')() : SC.esc;   // whiteboard.js takes its esc from inspector.js
        const sysO = () => ({ combat: { light: { presets: [{ name: T, bright: 5, dim: 10, pick: true }, { name: P, bright: 20, dim: 40, unit: 'ft', pick: true }, { name: 'Lantern', bright: 3, dim: 3, unit: 'cells' }, { name: '', bright: 4, dim: 4, pick: true }, { name: 'Junk unit', bright: 2, dim: 6, unit: P, pick: true }, { name: 'Said yes', bright: 1, dim: 1, pick: 'true' }] } } });
        const mkOwn = opt => {
            const o = opt || {}, calls = { sent: [], toasts: [], done: null };
            const win = { wpSystemCore: o.core || SYo, wpSheets: { systemOf: () => (o.sys === undefined ? sysO() : o.sys) } };
            if (!o.noCore) win.wpFogCore = FCo;
            if (!o.noNet) win.wpNet = o.noSender ? {} : { tokLight(mapId, wbId, ob, done) { calls.sent.push([mapId, wbId, ob]); calls.done = done; return o.ret; } };
            const api = new Function('esc', 'window', 'getActiveMap', 'toast', "'use strict';\n" + slice('whiteboard.js', 'ownlight') + '\nreturn { ownLightPicks: ownLightPicks, ownLightHtml: ownLightHtml, askOwnLight: askOwnLight, gmLightToggle: gmLightToggle };')(escO, win, () => (o.noMap ? null : { id: 'm1' }), m => calls.toasts.push(m));
            api.calls = calls; return api;
        };
        const ROW_A = '<div class="menu-item cm-stance" style="display:flex; align-items:center; gap:6px; cursor:default;"><span class="cm-stance" style="flex:1;">Light</span><select class="cm-stance own-light" title="Your token&rsquo;s light: off, on, or one of the lights your GM offers" style="max-width:190px; padding:2px 4px; background:var(--panel); color:var(--ink); border:1px solid var(--edge); border-radius:4px;">', ROW_B = '</select></div>';
        const LOCKED_ROW = '<div class="menu-item" style="color:var(--dim); cursor:default;">&#128274; Light locked by the GM</div>';
        const optsOwn = html => { const m = /<select class="cm-stance own-light"[^>]*>([\s\S]*?)<\/select>/.exec(html); return m ? Array.from(m[1].matchAll(/<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g)).map(x => [x[1], !!x[2], x[3]]) : null; };
        const optText = os => os.map(x => '<option value="' + x[0] + '"' + (x[1] ? ' selected' : '') + '>' + x[2] + '</option>').join('');
        const tokO = extra => Object.assign({ id: 't1', isChar: true, ownerId: 'u_a', charName: T, name: P, label: T, color: P }, extra || {});
        const O1 = mkOwn(), picks = O1.ownLightPicks();
        check('own light: the lights on offer are the system\'s cleaned presets ticked "players may pick" (only as true), each by its place in the whole list; none without a system or the system core',
            j(picks.map(k => [k.i, k.p.name])) === j([[0, T], [1, P], [3, 'Junk unit']]) && !('unit' in picks[2].p) && j(mkOwn({ sys: null }).ownLightPicks()) === '[]' && j(mkOwn({ sys: { combat: { light: T } } }).ownLightPicks()) === '[]'
            && j(new Function('esc', 'window', 'getActiveMap', 'toast', "'use strict';\n" + slice('whiteboard.js', 'ownlight') + '\nreturn ownLightPicks;')(escO, {}, () => null, () => {})()) === '[]', picks);
        const ownName = P + T, cleanedName = (FCo.cleanLight({ bright: 7, dim: 9, name: ownName }) || {}).name;
        const hA = O1.ownLightHtml(tokO({ light: { bright: 7, dim: 9, name: ownName } })), oA = optsOwn(hA);
        check('own light: hostile preset names and the light\'s own hostile name render without a crash and nothing in the row can run or call out', typeof hA === 'string' && hA.length > 0 && risks(hA).length === 0 && hA.indexOf(T) < 0 && hA.indexOf(P) < 0 && hA.indexOf('onmouseover="') < 0 && hA.indexOf('<img') < 0, risks(hA));
        check('own light: every name lands escaped as an option\'s text, and the option values are "off", "on" and places in the list only',
            !!oA && j(oA) === j([['off', false, 'Off'], ['on', true, escO(cleanedName)], ['0', false, escO(T) + ' (5 / 10 yd)'], ['1', false, escO(P) + ' (20 / 40 ft)'], ['3', false, 'Junk unit (2 / 6 yd)']]) && cleanedName === ownName
            && oA.every(x => /^(off|on|[0-9]{1,3})$/.test(x[0])), oA);
        check('own light: around its options the row is fixed text — the label, the select\'s title and its style hold nothing of the campaign', !!oA && hA === ROW_A + optText(oA) + ROW_B, hA);
        const hNone = O1.ownLightHtml(tokO()), oNone = optsOwn(hNone), hNoName = O1.ownLightHtml(tokO({ light: { bright: 2, dim: 2, off: true } })), oNoName = optsOwn(hNoName);
        check('own light: a token with no light yet reads "No light" (an empty value, selected) before the lights on offer; a light with no name reads "Its light", and one put out shows Off selected',
            j(oNone) === j([['', true, 'No light'], ['0', false, escO(T) + ' (5 / 10 yd)'], ['1', false, escO(P) + ' (20 / 40 ft)'], ['3', false, 'Junk unit (2 / 6 yd)']]) && hNone === ROW_A + optText(oNone) + ROW_B && risks(hNone).length === 0
            && j(oNoName.slice(0, 2)) === j([['off', true, 'Off'], ['on', false, 'Its light']]) && oNoName.length === 5 && hNoName === ROW_A + optText(oNoName) + ROW_B, [oNone, oNoName]);
        const oSame = optsOwn(O1.ownLightHtml(tokO({ light: { bright: 20, dim: 40, unit: 'ft', name: P } }))), oSameOff = optsOwn(O1.ownLightHtml(tokO({ light: { bright: 20, dim: 40, unit: 'ft', name: P, off: true } }))), oOther = optsOwn(O1.ownLightHtml(tokO({ light: { bright: 20, dim: 41, unit: 'ft', name: P } }))), oNoPick = optsOwn(O1.ownLightHtml(tokO({ light: { bright: 3, dim: 3, unit: 'cells', name: 'Lantern' } })));
        check('own light: a light copied from a light on offer shows that one selected and no "on" of its own; put out, Off is selected; the same name with other radii, or a preset not on offer, reads as the token\'s own light',
            j(oSame) === j([['off', false, 'Off'], ['0', false, escO(T) + ' (5 / 10 yd)'], ['1', true, escO(P) + ' (20 / 40 ft)'], ['3', false, 'Junk unit (2 / 6 yd)']]) && j(oSameOff.map(x => [x[0], x[1]])) === j([['off', true], ['0', false], ['1', false], ['3', false]])
            && j(oOther.map(x => [x[0], x[1]])) === j([['off', false], ['on', true], ['0', false], ['1', false], ['3', false]]) && oOther[1][2] === escO(P)
            && j(oNoPick.map(x => [x[0], x[1], x[2]]).slice(0, 2)) === j([['off', false, 'Off'], ['on', true, 'Lantern']]) && oNoPick.every(x => x[0] !== '2'), [oSame, oSameOff, oOther, oNoPick]);
        const hUnit = O1.ownLightHtml(tokO({ light: { bright: '7" onfocus="alert(1)', dim: 12, unit: P, name: 'n', off: T } })), oUnit = optsOwn(hUnit);
        const junkLights = [T, P, 5, true, [], 0, { bright: T, dim: P, unit: U, name: T }, { bright: 0, dim: 0, name: T }, { bright: NaN, dim: -4, name: P }, { name: T, unit: P }, null].map(l => O1.ownLightHtml(tokO({ light: l })));
        check('own light: the token\'s light is cleaned first — a hostile unit, radii that are no numbers or an "off" that is not true never reach the row, and a light that is no light reads as none',
            j(oUnit.slice(0, 2)) === j([['off', false, 'Off'], ['on', true, 'n']]) && hUnit === ROW_A + optText(oUnit) + ROW_B && hUnit.indexOf('onfocus') < 0 && hUnit.indexOf(P) < 0 && risks(hUnit).length === 0
            && junkLights.every(h => h === hNone), [oUnit, junkLights.filter(h => h !== hNone).length]);
        const oddSys = { combat: { light: { presets: [{ name: 'Odd', bright: T, dim: '9" onfocus="x', unit: T, pick: true }, { name: 'Far', bright: 5000, dim: -3, unit: 'm', pick: true }, { name: T.repeat(40) + P, bright: 1, dim: 2, pick: true }] } } }, O2 = mkOwn({ sys: oddSys }), hOdd = O2.ownLightHtml(tokO()), oOdd = optsOwn(hOdd);
        check('own light: a preset\'s radii read as numbers and its unit as one of the four the app knows, whatever the system file held; a long hostile name is cut and escaped',
            !!oOdd && hOdd === ROW_A + optText(oOdd) + ROW_B && risks(hOdd).length === 0 && hOdd.indexOf('onfocus') < 0 && hOdd.indexOf(T) < 0 && oOdd.length >= 2 && oOdd[0][0] === ''
            && oOdd.slice(1).every(x => /^[0-9]{1,3}$/.test(x[0]) && / \((\d+(\.\d+)?) \/ (\d+(\.\d+)?) (yd|ft|m|cells)\)$/.test(x[2])), oOdd);
        const rawCore = { lightPresets: () => [{ name: T, bright: T, dim: '9" onfocus="x', unit: P, pick: true }, { name: P, bright: 1, dim: 2, unit: T, pick: true }, null, { name: 'Feet', bright: 1, dim: 2, unit: 'ft', pick: true }] }, hRaw = mkOwn({ core: rawCore }).ownLightHtml(tokO()), oRaw = optsOwn(hRaw);
        check('own light: even a list handed over uncleaned writes only numbers for the radii and one of the four units the app knows',
            j(oRaw) === j([['', true, 'No light'], ['0', false, escO(T) + ' (0 / 0 yd)'], ['1', false, escO(P) + ' (1 / 2 yd)'], ['3', false, 'Feet (1 / 2 ft)']]) && hRaw === ROW_A + optText(oRaw) + ROW_B && risks(hRaw).length === 0 && hRaw.indexOf(P) < 0 && hRaw.indexOf(T) < 0 && hRaw.indexOf('onfocus') < 0, oRaw);
        const hLock = O1.ownLightHtml(tokO({ lightLock: true, light: { bright: 7, dim: 9, name: ownName } })), hLockBare = O1.ownLightHtml(tokO({ lightLock: true }));
        check('own light: a light the GM locked shows one dim row of fixed words, with no select and nothing of the campaign in it', hLock === LOCKED_ROW && hLockBare === LOCKED_ROW && risks(hLock).length === 0);
        check('own light: only a lock that is exactly true locks — a lock that reads as text, a number or an object leaves the select as it was',
            ['"><img', {}, 1, 'true', [true], null, false, undefined].every(v => O1.ownLightHtml(tokO({ lightLock: v, light: { bright: 7, dim: 9, name: ownName } })) === hA));
        const litTok = { light: { bright: 7, dim: 9, name: ownName } };
        const empties = [O1.ownLightHtml(null), O1.ownLightHtml(undefined), O1.ownLightHtml(tokO(Object.assign({ isChar: false }, litTok))), O1.ownLightHtml(tokO(Object.assign({ waiting: 1 }, litTok))), O1.ownLightHtml(tokO(Object.assign({ locked: true }, litTok))), O1.ownLightHtml(tokO(Object.assign({ hidden: true }, litTok))),
            O1.ownLightHtml(tokO(Object.assign({ locked: true, lightLock: true }, litTok))), O1.ownLightHtml(tokO(Object.assign({ hidden: true, lightLock: true }, litTok))), O1.ownLightHtml(tokO(Object.assign({ waiting: 1, lightLock: true }, litTok))),
            mkOwn({ noNet: true }).ownLightHtml(tokO(litTok)), mkOwn({ noSender: true }).ownLightHtml(tokO(litTok)), mkOwn({ noCore: true }).ownLightHtml(tokO(litTok)),
            mkOwn({ sys: null }).ownLightHtml(tokO()), mkOwn({ sys: { combat: { light: { presets: [{ name: T, bright: 5, dim: 10 }] } } } }).ownLightHtml(tokO()), mkOwn({ sys: null }).ownLightHtml(tokO({ lightLock: true }))];
        check('own light: no row at all (an empty string, no campaign text) for no token, a token that is no character, a waiting, locked or hidden one, with no sender or no fog core, or with neither a light nor a light on offer',
            empties.every(h => h === ''), empties.map(h => h.length));
        check('own light: a token with a light keeps its switch where the system offers nothing to pick', j(optsOwn(mkOwn({ sys: null }).ownLightHtml(tokO({ light: { bright: 1, dim: 1, name: T } })))) === j([['off', false, 'Off'], ['on', true, escO(T)]]));

        // askOwnLight, run for real: what is asked of the host, and what is said
        const A1 = mkOwn(), tA = tokO({ light: { bright: 7, dim: 9 } });
        A1.askOwnLight(tA, 'off'); A1.askOwnLight(tA, 'on'); A1.askOwnLight(tA, '1'); A1.askOwnLight(tA, '3');
        check('own light: "off" and "on" ask the host for a plain switch, a place in digits for that preset by its place and its name — never a radius or a unit',
            j(A1.calls.sent) === j([['m1', 't1', { on: false }], ['m1', 't1', { on: true }], ['m1', 't1', { on: true, preset: 1, name: P }], ['m1', 't1', { on: true, preset: 3, name: 'Junk unit' }]]) && A1.calls.toasts.length === 0, A1.calls.sent);
        const A2 = mkOwn(), gone = ['2', '4', '5', '99', '999', '1000', '-1', '1.5', ' 1', '1 ', '+1', '0x1', '1e0', '__proto__', 'constructor', 'length', 'toString', 'NaN', 'On', 'OFF', T, P];
        gone.forEach(v => A2.askOwnLight(tA, v));
        const A3 = mkOwn(); ['', null, undefined, 0, 1, true, {}, ['1'], ['off']].forEach(v => A3.askOwnLight(tA, v)); A3.askOwnLight(null, 'off'); const A4 = mkOwn({ noMap: true }); A4.askOwnLight(tA, 'off'); const A5 = mkOwn({ noSender: true }); A5.askOwnLight(tA, 'off');
        check('own light: a place that is not on offer (a preset not ticked, one past the list, a prototype\'s name, another way of writing a number) sends nothing and says so; an empty value, one that is no text, no token, no map or no sender does nothing',
            A2.calls.sent.length === 0 && A2.calls.toasts.length === gone.length && A2.calls.toasts.every(m => m === 'That light is no longer on offer.') && A3.calls.sent.length === 0 && A3.calls.toasts.length === 0 && A4.calls.sent.length === 0 && A4.calls.toasts.length === 0 && A5.calls.toasts.length === 0,
            [A2.calls.sent, A2.calls.toasts.length, A3.calls.sent, A3.calls.toasts]);
        const A6 = mkOwn(); A6.askOwnLight(tA, 'on'); A6.calls.done({ ok: true }); A6.askOwnLight(tA, 'off'); A6.calls.done({ ok: true }); A6.askOwnLight(tA, '0'); A6.calls.done({ error: T }); const A7 = mkOwn({ ret: { error: P } }); A7.askOwnLight(tA, 'on');
        check('own light: the host\'s answer and the sender\'s own refusal are said by toast (text, as given); a change made says lit or out in fixed words',
            j(A6.calls.toasts) === j(['Your token’s light is lit.', 'Your token’s light is out.', T]) && j(A7.calls.toasts) === j([P]) && /\nfunction toast\(msg\) \{ if\(window\.appToast\) window\.appToast\(msg\); \}/.test(wbO) && /\nwindow\.appToast = toast;/.test(ioO), [A6.calls.toasts, A7.calls.toasts]);

        // the GM's own switch (whiteboard.js gmLightToggle), run for real
        const G1 = mkOwn({ noNet: true }), gOn = { id: 'a', isChar: true, charName: T, light: { bright: 5, dim: 10, unit: 'ft', name: T } }, gOff = { id: 'b', type: 'light', light: { bright: 2, dim: 3, off: true, name: P } }, gNone = { id: 'c', isChar: true, light: { bright: 0, dim: 0 } }, gWait = { id: 'd', isChar: true, waiting: 1, light: { bright: 4, dim: 4 } }, gJunk = { id: 'e', isChar: true, light: T };
        const keyed = l => (l && typeof l === 'object' ? Object.keys(l).sort().map(k => [k, l[k]]) : l);   // a light by its keys in order: the switch may write them in another
        const g1 = G1.gmLightToggle([gOn, null, gOff, gNone, gWait, gJunk, undefined]), g1was = g1 && [g1.anyOn, g1.lit.length], went1 = g1 && g1.apply(), after1 = j([gOn.light, gOff.light, gNone.light, gWait.light, gJunk.light].map(keyed));
        const g2 = G1.gmLightToggle([gOn, gOff]), went2 = g2 && g2.apply(), after2 = j([gOn.light, gOff.light].map(keyed));
        check('GM light switch: the selected lights go off when any of them is on, else on — radii, unit and name kept, the light cleaned; a waiting token and an item with no light are left alone; nothing to switch gives no row',
            j(g1was) === j([true, 2]) && went1 === 'off' && after1 === j([{ bright: 5, dim: 10, off: true, unit: 'ft', name: T }, { bright: 2, dim: 3, off: true, name: P }, { bright: 0, dim: 0 }, { bright: 4, dim: 4 }, T].map(keyed))
            && !!g2 && g2.anyOn === false && went2 === 'on' && after2 === j([{ bright: 5, dim: 10, unit: 'ft', name: T }, { bright: 2, dim: 3, name: P }].map(keyed))
            && G1.gmLightToggle([gNone, gWait, gJunk, null]) === null && G1.gmLightToggle([]) === null && G1.gmLightToggle(null) === null && mkOwn({ noCore: true }).gmLightToggle([gOn]) === null, [g1was, went1, after1, went2, after2]);
        check('GM light switch (whiteboard.js): the menu row is fixed text — "Light off" or "Light on", no name of a light or a token — and what it did is said in fixed words',
            /\n            if \(gmLit\) html \+= '<div class="menu-item cm-light">&#128161; ' \+ \(gmLit\.anyOn \? 'Light off' : 'Light on'\) \+ '<\/div>';\n/.test(wbO) && (wbO.match(/cm-light"/g) || []).length === 1
            && /\} else if \(action\.includes\('cm-light'\)\) \{\n\s*var gmLitNow = gmLightToggle\(selectedIds\.map\(function\(sid\) \{ return am\.whiteboard\.find\(function\(x\) \{ return x\.id === sid; \}\); \}\)\);\n\s*if \(gmLitNow\) \{ var wentL = gmLitNow\.apply\(\);[^\n]*m\.toast\(wentL === 'off' \? 'Light off\.' : 'Light on\.'\)\); \}\n\s*\} else if \(action\.includes\('cm-grid'\)\) \{/.test(wbO));
        check('own light (whiteboard.js): the player\'s menu takes the row from ownLightHtml alone, and the select\'s own value is all that is asked with',
            /\n    rows \+= ownLightHtml\(tok\);[^\n]*\n    rows \+= tokenSensesLine\(tok\);[^\n]*\n    if \(!rows && !sheetRow && !hudRow && !picRow && !fxRow\) return;\n/.test(wbO)
            && /\n    var ownLight = cMenu\.querySelector\('\.own-light'\);\n    if \(ownLight\) \{ ownLight\.addEventListener\('click', function\(ce\) \{ ce\.stopPropagation\(\); \}\); ownLight\.addEventListener\('change', function\(ce\) \{ ce\.stopPropagation\(\); cMenu\.style\.display = 'none'; askOwnLight\(tok, ownLight\.value\); \}\); \}\n/.test(wbO)
            && /\|\| ownLightHtml\(tokO\) \|\| ownPicOk\(tokO\) \|\| tokenSensesLine\(tokO\) \|\| \(window\.wpSheets && window\.wpSheets\.tokenFxModel && window\.wpSheets\.tokenFxModel\(tokO\)\)\)\) \{ e\.preventDefault\(\); showStanceMenu\(e, tokO\); \}/.test(wbO));

        // the GM's Light block with the lock tick (inspector.js lightFieldHtml), run for real
        const envI = { getActiveCampaign: () => ({ id: 'c1', system: sysO() }), window: { wpSystemCore: SYo, wpFogCore: FCo }, toast() {}, save() {}, render() {}, renderInspector() {} };
        const II = new Function('env', 'esc', "'use strict';\nvar getActiveCampaign = env.getActiveCampaign, window = env.window, toast = env.toast, save = env.save, render = env.render, renderInspector = env.renderInspector;\n" + slice('inspector.js', 'lightfield') + '\nreturn { lightPresetsNow: lightPresetsNow, lightFieldHtml: lightFieldHtml };')(envI, escO);
        const presI = II.lightPresetsNow(), LI = FCo.cleanLight({ bright: 7, dim: 9, name: ownName });
        const TICK = '<div class="field check-row"><input type="checkbox" id="wbLightLock" > <label for="wbLightLock" title="Its player may switch this token&rsquo;s light and pick one of the presets you ticked Players may pick, from the token&rsquo;s right-click menu. Locked: only you change it.">Light locked (its player can&rsquo;t change it)</label></div>';
        const NOTE = '<div class="muted" style="margin:-2px 0 6px; font-size:10.5px;">Lights the fog while Lighting is on (&#9881; Settings &#9656; VTT features): bright out to the first radius, dim to the second; walls and closed doors stop it.';
        const tokBase = II.lightFieldHtml(tokO(), LI, presI), tokTicked = II.lightFieldHtml(tokO({ lightLock: true }), LI, presI), tokBare = II.lightFieldHtml(tokO(), null, []);
        check('light lock: a token\'s Light block holds the tick and its label in fixed words, last before the note; nothing in the block can run or call out',
            tokBase.split('id="wbLightLock"').length === 2 && tokBase.endsWith(TICK + NOTE + '</div>') && tokBare.endsWith(TICK + NOTE + '</div>') && risks(tokBase).length === 0 && risks(tokTicked).length === 0 && tokBase.indexOf(T) < 0 && tokBase.indexOf(P) < 0, tokBase.slice(-700));
        check('light lock: a locked light shows the tick ticked, and that is all that differs', tokTicked === tokBase.replace('id="wbLightLock" >', 'id="wbLightLock" checked>') && tokTicked !== tokBase && /id="wbLightLock" checked>/.test(tokTicked));
        check('light lock: a lock that is not exactly true — markup, an object, a number, the word — reads unticked and never reaches the block',
            ['"><img', '"><img src=x onerror=alert(1)>', T, P, {}, { toString: () => 'checked' }, 1, 'true', 'checked', [true], null, false, 0].every(v => II.lightFieldHtml(tokO({ lightLock: v }), LI, presI) === tokBase));
        const srcBase = II.lightFieldHtml({ type: 'light' }, LI, presI), srcLocked = II.lightFieldHtml({ type: 'light', lightLock: true, name: T }, LI, presI);
        check('light lock: a light source has no tick, locked or not, and its block still ends with the note that players never see the marker',
            srcBase.indexOf('wbLightLock') < 0 && srcLocked === srcBase && srcBase.endsWith('<div class="field check-row"><input type="checkbox" id="wbLightOn" checked> <label for="wbLightOn">Light is on</label></div>' + NOTE + ' Players see its light, never this marker.</div>') && tokBase.indexOf('never this marker') < 0 && risks(srcBase).length === 0, srcBase.slice(-500));
        check('light lock (inspector.js): the tick writes true or takes the key away, nothing else, and saves',
            /\n\s*var _el_wbLK = document\.getElementById\('wbLightLock'\);\n\s*if \(_el_wbLK\) _el_wbLK\.addEventListener\('change', function\(\) \{ if \(this\.checked\) w\.lightLock = true; else delete w\.lightLock; save\(\); \}\);\n/.test(inspO));

        // the host's words for the GM (net.js tok-light), run for real: a toast and a line of the session log
        const tlA = netO.indexOf('// [netcheck:toklight-start]'), tlB = netO.indexOf('// [netcheck:toklight-end]'), tlS = tlA >= 0 && tlB > tlA && netO.indexOf('// [netcheck:toklight-start]', tlA + 1) < 0 ? netO.slice(tlA, tlB) : '';
        const ownLine = /\nfunction own\(o, k\) \{[^\n]*\}\n/.exec(netO), ownN = ownLine ? new Function(ownLine[0] + '\nreturn own;')() : null;
        check('tok-light: the host\'s branch and the own-key helper slice out of net.js', tlS.length > 0 && typeof ownN === 'function' && ownN({ a: 1 }, 'a') === true && ownN({}, '__proto__') === false && ownN({}, 'constructor') === false);
        const runTL = (msg, o) => {
            const calls = { sent: [], toasts: [], logs: [], saves: 0, casts: [], threw: null };
            const camp = { id: 'c1', system: sysO(), activeItemId: 'm9', items: { m1: { id: 'm1', type: 'map', whiteboard: [o.tok] } } };
            const netT = { roster: { peerA: { id: 'u_a', name: o.player } }, paused: false, applyingRemote: false, broadcastItemFiltered(c, m) { calls.casts.push([c, m]); } };
            const winT = { wpFogCore: FCo, wpSystemCore: SYo, wpFog: { lightCount: () => 0, invalidateVision() {}, redraw() {} } };
            try {
                new Function('msg', 'conn', 'net', 'window', 'own', 'peerPaused', 'getActiveCampaign', 'allow', 'save', 'render', 'toast', 'logEvent', 'sendFailed', "'use strict';\n" + tlS)(
                    msg, { peer: 'peerA', send: m => calls.sent.push(m) }, netT, winT, ownN, () => false, () => camp, () => true, () => { calls.saves++; }, () => {}, m => calls.toasts.push(m), (k, t) => calls.logs.push([k, t]), () => {});
            } catch (e) { calls.threw = String(e); }
            return calls;
        };
        const tokName = P + T, tk = extra => Object.assign({ id: 't1', isChar: true, ownerId: 'u_a', charName: tokName }, extra || {});
        const tkPick = tk(), rPick = runTL({ type: 'tok-light', rid: 'r1', mapId: 'm1', wbId: 't1', on: true, preset: 1, name: P, bright: 999, dim: 999, unit: T }, { player: T, tok: tkPick });
        const tkOff = tk({ light: { bright: 5, dim: 10, name: T } }), rOff = runTL({ type: 'tok-light', rid: 'r2', mapId: 'm1', wbId: 't1', on: false }, { player: P, tok: tkOff });
        const tkOn = tk({ light: { bright: 5, dim: 10, off: true }, charName: '' }), rOn = runTL({ type: 'tok-light', rid: 'r3', mapId: 'm1', wbId: 't1', on: true }, { player: '', tok: tkOn });
        const saidPick = T + ' lit ' + P + ' on their token (' + tokName + ')', saidOff = P + ' put out the light of their token (' + tokName + ')', saidOn = 'A player lit the light of their token (their token)';
        check('tok-light: the GM is told by a toast and a line of the log, both plain text made of the player\'s name, the light\'s name and the token\'s name as they are (no markup is built of them)',
            rPick.threw === null && j(rPick.toasts) === j([saidPick + '.']) && j(rPick.logs) === j([['char', saidPick]]) && j(rOff.toasts) === j([saidOff + '.']) && j(rOff.logs) === j([['char', saidOff]]) && j(rOn.toasts) === j([saidOn + '.']) && j(rOn.logs) === j([['char', saidOn]])
            && rPick.saves === 1 && j(rPick.casts) === j([['c1', 'm1']]), [rPick, rOff, rOn]);
        check('tok-light: the light written is the host\'s own preset by value (no number or unit of the message), and the token\'s own light keeps its radii and name when switched',
            j(tkPick.light) === j({ bright: 20, dim: 40, unit: 'ft', name: P }) && j(tkOff.light) === j({ bright: 5, dim: 10, off: true, name: T }) && j(tkOn.light) === j({ bright: 5, dim: 10 }), [tkPick.light, tkOff.light, tkOn.light]);
        check('tok-light: the answer to the player holds no name at all — ok, the kind and the request\'s own id',
            j(rPick.sent) === j([{ ok: true, type: 'tok-light-ans', rid: 'r1' }]) && j(rOff.sent) === j([{ ok: true, type: 'tok-light-ans', rid: 'r2' }]) && j(rOn.sent) === j([{ ok: true, type: 'tok-light-ans', rid: 'r3' }]), [rPick.sent, rOff.sent, rOn.sent]);
        const rBad = [runTL({ type: 'tok-light', rid: 'r4', mapId: 'm1', wbId: 't1', on: true, preset: 1, name: T }, { player: T, tok: tk() }), runTL({ type: 'tok-light', rid: 'r5', mapId: 'm1', wbId: 't1', on: true }, { player: T, tok: tk() }), runTL({ type: 'tok-light', rid: 'r6', mapId: 'm1', wbId: T, on: true }, { player: T, tok: tk() }), runTL({ type: 'tok-light', rid: 'r7', mapId: 'm1', wbId: 't1', on: false }, { player: T, tok: tk({ lightLock: true, light: { bright: 1, dim: 1, name: T } }) })];
        check('tok-light: a refusal says nothing to the GM and answers the player with one of the host\'s own short reasons, never a name',
            rBad.every(r => r.threw === null && r.toasts.length === 0 && r.logs.length === 0 && r.saves === 0 && r.casts.length === 0 && r.sent.length === 1 && j(Object.keys(r.sent[0]).sort()) === j(['reason', 'rid', 'type']) && /^[a-z]{2,12}$/.test(r.sent[0].reason))
            && j(rBad.map(r => r.sent[0].reason)) === j(['preset', 'nolight', 'missing', 'lightlock']), rBad.map(r => r.sent));
        check('tok-light (net.js): the branch builds no markup (no innerHTML, no element, no document) — its words go to toast, which writes textContent, and to the session log, whose lines are shown through escText',
            tlS.length > 0 && !/innerHTML|outerHTML|insertAdjacentHTML|createElement|document\.|\.html\(|setAttribute|\.title\s*=/.test(tlS)
            && /\n        var tL = \(prL\.name \|\| 'A player'\) \+ \(newL\.off \? ' put out the light of their token \(' : newL\.name \? ' lit ' \+ newL\.name \+ ' on their token \(' : ' lit the light of their token \('\) \+ \(wL\.charName \|\| 'their token'\) \+ '\)';\n        toast\(tL \+ '\.'\); logEvent\('char', tL\);\n/.test(netO)
            && (tlS.match(/\btoast\(/g) || []).length === 1 && (tlS.match(/\blogEvent\(/g) || []).length === 1
            && /\nimport \{ save, toast, load \} from '\.\/io\.js';/.test(netO) && /export function toast\(msg\) \{[\s\S]{0,120}document\.getElementById\('toastMsg'\)\.textContent = msg;/.test(ioO)
            && /camp\.sessionLog\.push\(\{ at: Date\.now\(\), kind: kind, text: String\(text \|\| ''\)\.slice\(0, 400\) \}\);/.test(netO) && /<span class="log-text">' \+ escText\(e\.text\) \+ '<\/span>/.test(netO));
        const whyLine = /\nvar LIGHT_WHY = (\{[^\n]*\});[^\n]*\n/.exec(netO), WHY = whyLine ? new Function('return ' + whyLine[1] + ';')() : null;
        check('tok-light: the words a player reads for a refusal are the app\'s own fixed sentences, one for each reason the host gives, holding no markup',
            !!WHY && ['paused', 'slow', 'missing', 'tokowner', 'locked', 'lightlock', 'preset', 'nolight', 'cap', 'off'].every(k => Object.prototype.hasOwnProperty.call(WHY, k) && typeof WHY[k] === 'string' && WHY[k].length > 0 && !/[<>"&]/.test(WHY[k]))
            && (tlS.match(/reason: '([a-z]+)'/g) || []).every(r => Object.prototype.hasOwnProperty.call(WHY, /'([a-z]+)'/.exec(r)[1])) && (tlS.match(/reason: '([a-z]+)'/g) || []).length >= 10
            && /var WK = pK\.kind === 'tok-pic' \? TOK_WHY : pK\.kind === 'tok-light' \? LIGHT_WHY : MK_WHY; pK\.done\(\{ error: typeof msg\.reason === 'string' && Object\.prototype\.hasOwnProperty\.call\(WK, msg\.reason\) \? WK\[msg\.reason\] : 'The GM could not do that\.' \}\);/.test(netO), WHY);
    }
    {   // conditions C1: a token's effects drawn on it (whiteboard.js tokenFxHtml, sliced by its tokenfx markers) and which list a screen draws
        // (sheets.js tokenFx, tokenfxlist), run for real on hostile names and icons
        const J = JSON.stringify, SYc = await import(modUrl('systemcore.js') + '?c1'), inspC = read('inspector.js'), escC = new Function((/\n  function esc\(s\)\{[^\n]*\}\n/.exec(inspC) || ['function esc(s){return String(s)}'])[0] + '\nreturn esc;')();
        const txS = slice('whiteboard.js', 'tokenfx'), TX = new Function('esc', 'window', "'use strict';\n" + txS + '\nreturn tokenFxHtml;')(escC, { wpSystemCore: SYc });
        const hostile = [{ n: '<img src=x onerror=alert(1)>', i: 'icon:bolt', t: 'buff' }, { n: 'P"q', i: '<script>x</script>', t: 'debuff' }, { n: 'quiet', i: '', t: 'x" onclick="y', g: 1 }, { n: 'E4', i: 'icon:bolt' }, { n: 'E5', i: 'a' }, { n: 'E6', i: 'b' }, { n: 'E7', i: 'c' }, { n: 'E8', i: 'd' }, { n: 'E9', i: 'e' }];
        const hx = TX(hostile), glyphs = hx.match(/url\(&quot;[^&]*&quot;\)/g) || [];
        check('conditions C1: a token\'s effects are drawn as a row of icons — a glyph as a mask whose address comes only from the app\'s own table, an emoji or symbol and every name escaped, a tone only as its class, a GM-only one dashed; six drawn then "+N" for the rest of eight; nothing for an empty list or one with no named effect',
            !/<img|<script| onclick="| onerror="/.test(hx) && glyphs.length === 4 && glyphs.every(u => u === 'url(&quot;/assets/icons/fa/solid/bolt.svg&quot;)') && hx.indexOf('&lt;script&gt;') > 0 && hx.indexOf('title="&lt;img src=x onerror=alert(1)&gt; · P&quot;q · quiet · E4 · E5 · E6 · E7 · E8"') > 0
            && (hx.match(/class="tfx(?: [^"]*)?"/g) || []).map(c => c.slice(7, -1)).join('|') === 'tfx buff|tfx debuff|tfx gm|tfx|tfx|tfx|tfx more' && hx.indexOf('>+2</span>') > 0 && hx.indexOf('<span class="tfx gm">Q</span>') > 0
            && TX([]) === '' && TX(null) === '' && TX([{ n: '' }, { i: 'x' }, null, 'x']) === '' && !/innerHTML|insertAdjacentHTML|outerHTML/.test(txS), hx.slice(0, 400));
        const tlS = slice('sheets.js', 'tokenfxlist'), campC = { system: { fields: [{ id: 'f_fx', key: 'Effects', kind: 'effects' }], effects: [{ id: 'e_gm', name: 'Cursed', icon: 'X', vis: 'gm' }] }, chars: { c_a: { id: 'c_a', values: { f_fx: [{ id: 'r', ref: 'e_gm' }] } } } };
        const mkTL = (net, sheetsOn) => new Function('window', 'getActiveCampaign', 'systemOf', 'charById', 'F', "'use strict';\n" + tlS + '\nreturn tokenFx;')({ wpSystemCore: SYc, wpNet: net, wpVtt: { on: k => k !== 'sheets' || sheetsOn !== false } }, () => campC, c => c.system, id => campC.chars[id] || null, () => null);
        const tokC = { id: 't', isChar: true, charId: 'c_a', fxb: [{ n: 'Sent', i: '', t: '' }] };
        const tlGot = [mkTL(null)(tokC), mkTL({ active: true, role: 'host' })(tokC), mkTL({ active: true, role: 'client' })(tokC), mkTL({ foreign: true })(tokC), mkTL({ active: true, role: 'client' })({ id: 'u', isChar: true }), mkTL(null, false)(tokC), mkTL(null)({ id: 'p', charId: 'c_a' })];
        check('conditions C1: which effects a screen draws on a token — the GM\'s worked out from its own character (a GM-only one marked), a player\'s (or the GM\'s campaign on a player\'s screen) only what the host sent on the token; none while character sheets are off or on a piece that is no character token',
            J(tlGot) === J([[{ n: 'Cursed', i: 'X', t: '', g: 1 }], [{ n: 'Cursed', i: 'X', t: '', g: 1 }], [{ n: 'Sent', i: '', t: '' }], [{ n: 'Sent', i: '', t: '' }], [], [], []]), J(tlGot));
        // conditions C2: a token's Effects menu — what it offers (sheets.js tokenFxModel), the sheet's path for a character token (tokenFxCharOp),
        // its lines (whiteboard.js tokenFxMenuHtml, tokfxmenu) and a token with no sheet's own effects (tokenFxOp), run for real
        const FCm = await import(modUrl('fogcore.js') + '?c2'), sysM = e => ({ fields: [{ id: 'f_fx', key: 'Effects', kind: 'effects', vis: 'all', edit: e || 'owner' }, { id: 'f_n', key: 'N', kind: 'number', vis: 'all' }], effects: [{ id: 'e_pub', name: 'Blessed', icon: 'icon:bolt', tone: 'buff' }, { id: 'e_gm', name: 'Cursed', icon: 'X', vis: 'gm' }] });
        const charsM = () => ({ c_a: { id: 'c_a', ownerId: 'u_me', values: { f_fx: [{ id: 'x_1', ref: 'e_pub' }, { id: 'x_2', name: '<b>Own</b>', icon: '<i>', tone: 'debuff', on: false }, { id: 'x_3', ref: 'e_gm', on: false }] } }, c_b: { id: 'c_b', ownerId: 'u_else', values: {} }, c_p: { id: 'c_p', ownerId: 'u_me', partial: true, values: {} }, c_m: { id: 'c_m', ownerId: 'u_me', making: 1, values: {} } });
        const mkM = (o) => { const calls = []; const camp = { system: o.sys === undefined ? sysM(o.edit) : o.sys, chars: charsM() };
            const api = new Function('window', 'getActiveCampaign', 'systemOf', 'charById', 'isClient', 'canWrite', 'myId', 'commitEffect', 'uid', 'autoEffectsOn', 'F', "'use strict';\n" + tlS + '\nreturn { model: tokenFxModel, op: tokenFxCharOp };')(
                { wpSystemCore: SYc, wpFogCore: FCm, wpVtt: { on: k => k !== 'sheets' || o.sheets !== false } }, () => camp, c => c.system, id => (typeof id === 'string' && camp.chars[id]) || null, () => !!o.client, () => !o.client, () => 'u_me', (c, f, q) => calls.push([c.id, f.id, q]), p => p + 'new', SYc.autoEffectsOn, () => o.F || null);
            return Object.assign(api, { calls }); };
        const rowsOf = m => m && m.rows.map(r => [r.ref, r.rowId, r.name, r.gm, r.on]);
        const gmA = mkM({}).model({ id: 't', isChar: true, charId: 'c_a' }), plA = mkM({ client: true }).model({ id: 't', isChar: true, charId: 'c_a' });
        const noneM = [mkM({ client: true }).model({ id: 't', isChar: true, charId: 'c_b' }), mkM({ client: true, edit: 'gm' }).model({ id: 't', isChar: true, charId: 'c_a' }), mkM({ client: true }).model({ id: 't', isChar: true, charId: 'c_p' }), mkM({ client: true }).model({ id: 't', isChar: true, fx: [{ id: 'x_9', ref: 'e_pub' }] }),
            mkM({}).model({ id: 't', isChar: true, waiting: 1, charId: 'c_a' }), mkM({ sheets: false }).model({ id: 't', isChar: true, charId: 'c_a' }), mkM({}).model({ id: 't', type: 'rect', charId: 'c_a' }), mkM({ sys: null }).model({ id: 't', isChar: true, charId: 'c_a' }), mkM({ sys: { fields: [], effects: [] } }).model({ id: 't', isChar: true, charId: 'c_a' })];
        const mkg = mkM({ client: true, edit: 'gm' }).model({ id: 't', isChar: true, charId: 'c_m' }), own = mkM({}).model({ id: 't', isChar: true, fx: [{ id: 'x_9', ref: 'e_pub' }, { id: 'x_8', name: 'Hexed', tone: 'debuff' }, { id: 'nope', name: 'Gone' }] });
        check('conditions C2: what a token\'s Effects menu offers — for the GM a character token\'s library (each ticked by the row that applies it, a GM-only one marked) and the effects made on the spot it carries, or a token with no sheet\'s own; for a player only their own whole character\'s token where its sheet lets them (Player may edit, or while making it); nothing on another\'s, a waiting token, a piece that is no token, with sheets off, without a system or without an effects list',
            J(rowsOf(gmA)) === J([['e_pub', 'x_1', 'Blessed', false, true], ['e_gm', 'x_3', 'Cursed', true, false], ['', 'x_2', '<b>Own</b>', false, false]]) && gmA.char === 'c_a' && gmA.field === 'f_fx' && J(rowsOf(plA)) === J(rowsOf(gmA))
            && noneM.every(m => m === null) && !!mkg && own.char === '' && J(rowsOf(own)) === J([['e_pub', 'x_9', 'Blessed', false, true], ['e_gm', '', 'Cursed', true, false], ['', 'x_8', 'Hexed', false, true]]), J([rowsOf(gmA), noneM, rowsOf(own)]));
        const OPm = mkM({}); OPm.op('c_a', 'f_fx', { op: 'add', ref: 'e_gm' }); OPm.op('c_a', 'f_fx', { op: 'remove', rowId: 'x_1' }); OPm.op('c_a', 'f_nope', { op: 'add', ref: 'e_gm' }); OPm.op('c_a', 'f_n', { op: 'add', ref: 'e_gm' }); OPm.op('c_zz', 'f_fx', { op: 'add', ref: 'e_gm' }); OPm.op('c_a', 'f_fx', { op: 'wipe' }); OPm.op('c_a', 'f_fx', { op: 'add', ref: 5 }); OPm.op('c_a', 'f_fx', null);
        check('conditions C2: a character token\'s menu changes its effects by the sheet\'s own path — an add by the library effect with a new row, an end by its row — and nothing for a list that is no effects list, a character not there or an op it does not know',
            J(OPm.calls) === J([['c_a', 'f_fx', { op: 'add', rowId: 'x_new', ref: 'e_gm' }], ['c_a', 'f_fx', { op: 'remove', rowId: 'x_1' }]]), J(OPm.calls));
        const mnS = slice('whiteboard.js', 'tokenfx') + '\n' + slice('whiteboard.js', 'tokfxmenu'), mnCalls = { saves: 0, renders: 0, charOps: [], n: 0 }, persist = { on: true };
        const MN = new Function('esc', 'window', 'uid', 'save', 'render', 'document', "'use strict';\n" + mnS + '\nreturn { html: tokenFxMenuHtml, op: tokenFxOp };')(escC, { wpSystemCore: SYc, wpFogCore: FCm, wpCanPersistLocal: () => persist.on, wpSheets: { tokenFxCharOp: (c, f, q) => mnCalls.charOps.push([c, f, q]) } }, () => 'r' + (++mnCalls.n), () => { mnCalls.saves++; }, () => { mnCalls.renders++; }, {});
        const mh = MN.html({ charName: '<img src=x onerror=1>' }, { char: '', rows: [{ ref: 'e_1', rowId: 'x_1', name: '<script>n</script>', icon: 'icon:bolt', gm: true, on: true }, { ref: '', rowId: 'x_2', name: 'Off"x', icon: '<b>i</b>', gm: false, on: false }, { ref: 'e_2', rowId: '', name: 'Plain', icon: '', gm: false, on: false }] }), mhC = MN.html({ charName: 'Bren' }, { char: 'c_a', rows: [] });
        check('conditions C2: the menu\'s lines — its title, each effect\'s name and a symbol escaped, a glyph drawn from the app\'s own table, ticked when applied, a GM-only one tagged GM, one applied but switched off tagged off; a token with no sheet gets the line to make one; a character with an empty library says so',
            !/<img|<script|<b>| onerror="/.test(mh) && mh.indexOf('Effects &mdash; &lt;img src=x onerror=1&gt;') > 0 && (mh.match(/class="menu-item cm-fx(?: on)?"/g) || []).join('|') === 'class="menu-item cm-fx on"|class="menu-item cm-fx"|class="menu-item cm-fx"' && mh.indexOf('/assets/icons/fa/solid/bolt.svg') > 0
            && (mh.match(/cm-fx-tag gm/g) || []).length === 1 && (mh.match(/cm-fx-tag">off/g) || []).length === 1 && mh.indexOf('cm-fx-name') > 0 && mhC.indexOf('cm-fx-name') < 0 && mhC.indexOf('No effects in the system&rsquo;s library.') > 0, mh.slice(0, 300));
        const tokO = { id: 'orc', isChar: true }, mO = { char: '', rows: [] };
        MN.op(tokO, mO, { op: 'add', ref: 'e_pub' }); const o1 = J(tokO.fx); MN.op(tokO, mO, { op: 'add', ref: 'e_pub' }); const o2 = J(tokO.fx); MN.op(tokO, mO, { op: 'new', name: 'Hexed', tone: 'evil' }); const o3 = J(tokO.fx);
        MN.op(tokO, mO, { op: 'remove', rowId: 'x_r1' }); const o4 = J(tokO.fx); persist.on = false; MN.op(tokO, mO, { op: 'add', ref: 'e_gm' }); const o5 = J(tokO.fx); persist.on = true; MN.op(tokO, { char: 'c_a', field: 'f_fx', rows: [] }, { op: 'add', ref: 'e_gm' });
        check('conditions C2: a token with no sheet keeps its own effects, the GM\'s — an add by the library effect (once), one made on the spot (a tone of the two words), an end by its row, each saved and redrawn; a machine that may not write changes nothing; a character token\'s change goes to its sheet\'s path',
            o1 === J([{ id: 'x_r1', ref: 'e_pub' }]) && o2 === o1 && o3 === J([{ id: 'x_r1', ref: 'e_pub' }, { id: 'x_r2', name: 'Hexed', icon: '', tone: '' }]) && o4 === J([{ id: 'x_r2', name: 'Hexed', icon: '', tone: '' }]) && o5 === o4 && mnCalls.saves === 4 && mnCalls.renders === 4 && J(mnCalls.charOps) === J([['c_a', 'f_fx', { op: 'add', ref: 'e_gm' }]]), J([o1, o2, o3, o4, o5, mnCalls]));
    }
    const HOSTILE_C4 = '<img src=x onerror=alert(1)>';
    {   // conditions C3: a system's own postures — the menus' options (whiteboard.js postureOptionsHtml, postopts, with the postures in use from its
        // postranged slice), the chip and Properties (pinned), the stance control's words (sheets.js postureWords, posturewords), run for real
        const J = JSON.stringify, SYp = await import(modUrl('systemcore.js') + '?c3'), inspP = read('inspector.js'), escP = new Function((/\n  function esc\(s\)\{[^\n]*\}\n/.exec(inspP) || ['function esc(s){return String(s)}'])[0] + '\nreturn esc;')();
        const wbP = read('whiteboard.js').replace(/\r\n/g, '\n'), prA = wbP.indexOf('// [systemcheck:postranged-start]'), prZ = wbP.indexOf('// [systemcheck:postranged-end]'), sysP = { v: null };
        const POP = new Function('esc', 'window', 'stanceOn', "'use strict';\n" + wbP.slice(wbP.indexOf('var POSTURES = ['), wbP.indexOf('function stanceOn(')) + wbP.slice(prA, prZ) + slice('whiteboard.js', 'postopts') + '\nreturn postureOptionsHtml;')(escP, { wpSystemCore: SYp, wpSheets: { systemOf: () => sysP.v } }, () => true);
        sysP.v = { combat: { postures: [{ id: 'standing', name: '<b>Up</b>', tag: 'U' }, { id: 'p_h', name: '<img src=x onerror=1>', tag: '<i>', small: true }, { id: 'x" onmouseover="y', name: 'Q"r' }] } };
        const poH = POP({ posture: 'p_h' }); sysP.v = null; const poD = POP({ posture: 'kneeling' });
        check('conditions C3: the posture menus\' options — the postures in use, every name and id escaped, the token\'s own selected; without a list of the system\'s the seven as the website names them',
            !/<img|<b>| onmouseover="/.test(poH) && poH.indexOf('<option value="p_h" selected>&lt;img src=x onerror=1&gt;</option>') > 0 && poH.indexOf('value="x&quot; onmouseover=&quot;y">Q&quot;r</option>') > 0 && (poH.match(/<option /g) || []).length === 3
            && (poD.match(/<option /g) || []).length === 7 && poD.indexOf('<option value="kneeling" selected>Kneeling</option>') > 0 && poD.indexOf('>Lying prone (face down)</option>') > 0 && prA > 0, poH);
        const shP = read('sheets.js').replace(/\r\n/g, '\n'), fxCT = new Function('fmtNum', ((/\nfunction fxChangeText\(m, labels\) \{[^\n]*\}\n/.exec(shP) || ['function fxChangeText(){return "?"}'])[0]) + '\nreturn fxChangeText;')(SYp.fmtNum);
        const PW = new Function('fxChangeText', "'use strict';\n" + slice('sheets.js', 'posturewords') + '\nreturn postureWords;')(fxCT);
        const pwSys = { fields: [{ id: 'f_a', key: 'A', label: '<b>Atk</b>' }, { id: 'f_t', key: 'T' }] }, pwH = PW(pwSys, { i: 1, p: { mods: [{ f: 'f_a', op: 'add', v: -2 }, { f: 'f_t', op: 'on' }], small: true, notes: '<script>n</script>' } });
        check('conditions C3: the stance control\'s words — what the posture does as plain text for a text node (its changes by their fields\' labels, a smaller target\'s -2 in the website\'s words, its notes as written), nothing for the first posture; the control draws its options and words as text (sheets.js, pinned)',
            pwH === '<b>Atk</b> ' + String.fromCharCode(0x2212) + '2 ' + String.fromCharCode(0xb7) + ' T on ' + String.fromCharCode(0xb7) + ' Ranged attacks against you are at ' + String.fromCharCode(0x2212) + '2 (their roll, not yours) ' + String.fromCharCode(0xb7) + ' <script>n</script>'
            && PW(pwSys, { i: 0, p: { small: true, notes: 'x' } }) === '' && PW(pwSys, null) === '' && PW(pwSys, { i: 2, p: {} }) === '' && PW(pwSys, { i: 1, p: { small: true } }) === 'Ranged attacks against you are at ' + String.fromCharCode(0x2212) + '2 (their roll, not yours)' && PW(pwSys, { i: 1, p: { notes: 'Low', small: 'yes' } }) === 'Low'
            && shP.includes("postureList(sysS).forEach(function(p, i) { ps.appendChild(opt(p.id, p.name, atS.i === i)); });") && shP.includes("var pw = postureWords(sysS, atS); if (pw) wrap.appendChild(el('div', 'sheet-dial-note sheet-stance-fx', pw));")
            && /\nfunction el\(tag, cls, text\) \{ var e = document\.createElement\(tag\); if \(cls\) e\.className = cls; if \(text !== undefined\) e\.textContent = text; return e; \}\nfunction opt\(value, text, selected\) \{ var o = el\('option', null, text\); o\.value = value;/.test(shP), pwH);
        // conditions C4: an automatic effect on — the sheet's row (sheets.js autoFxInto, autofx) and the token menu's line and model, run for real
        const FRa = await import(modUrl('formula.js') + '?c4'), afS = slice('sheets.js', 'autofx'), mkE = (tag, cls, text) => ({ tag, className: cls || '', textContent: text === undefined ? '' : String(text), title: '', children: [], get childNodes() { return this.children; }, appendChild(c) { this.children.push(c); return c; } });
        const AF = new Function('el', 'iconNode', 'fxChangeText', 'autoEffectsOn', 'F', "'use strict';\n" + afS + '\nreturn autoFxInto;')(mkE, (ic, cls) => mkE('i', cls, ic), (m, lb) => (lb[m.f] || '?') + ' ' + m.v, SYp.autoEffectsOn, () => FRa);
        const sysAF = SYp.cleanSystem({ v: 1, name: 'A', fields: [{ id: 'f_fx', key: 'Effects', kind: 'effects' }, { id: 'f_fx2', key: 'More', kind: 'effects' }, { id: 'f_hp', key: 'HP', label: '<b>HP</b>', kind: 'number' }], rolls: [], effects: [{ id: 'e_down', name: HOSTILE_C4, icon: '<i>', tone: 'debuff', notes: '<script>n</script>', auto: 'HP <= 0', mods: [{ f: 'f_hp', op: 'add', v: 2 }] }, { id: 'e_two', name: 'Two', auto: 'HP <= 0' }] }, { F: FRa, gmView: true });
        const drawAF = (fid, rows) => { const w = mkE('div'); AF(w, { id: fid }, { id: 'c_1', values: { f_hp: 0 } }, rows, sysAF, { f_hp: '<b>HP</b>' }); return w; };
        const afW = drawAF('f_fx', []), afW2 = drawAF('f_fx2', []), afW3 = drawAF('f_fx', [{ id: 'x_1', ref: 'e_two' }]), flatAF = n => [n.className, n.textContent, n.title].concat((n.children || []).map(flatAF));
        check('conditions C4: the sheet draws an automatic effect on as a row that says Automatic (its formula in the tag\'s title), its name, notes and changes as text, no switch and no end; only under the system\'s first effects list, and not again where a row of the list applies it',
            afW.children.length === 2 && afW.children[0].className === 'sheet-fx sheet-fx-auto sheet-fx-debuff' && afW.children[0].children.find(c => c.className === 'sheet-fx-name').textContent === HOSTILE_C4 && afW.children[0].children.find(c => c.className === 'sheet-fx-name').title === '<script>n</script>'
            && afW.children[0].children.find(c => c.className === 'sheet-fx-autotag').textContent === 'Automatic' && afW.children[0].children.find(c => c.className === 'sheet-fx-autotag').title === 'On while HP <= 0' && afW.children[0].children.find(c => c.className === 'sheet-fx-mods').textContent === '<b>HP</b> 2'
            && !JSON.stringify(flatAF(afW)).includes('input') && afW2.children.length === 0 && afW3.children.length === 1 && afW3.children[0].children.find(c => c.className === 'sheet-fx-name').textContent === HOSTILE_C4 && !/innerHTML|insertAdjacentHTML|outerHTML/.test(afS), JSON.stringify(flatAF(afW)).slice(0, 300));
        const shA = read('sheets.js'), mnA = new Function('esc', 'window', 'uid', 'save', 'render', 'document', "'use strict';\n" + slice('whiteboard.js', 'tokenfx') + '\n' + slice('whiteboard.js', 'tokfxmenu') + '\nreturn tokenFxMenuHtml;')(escP, { wpSystemCore: SYp }, () => 'r', () => {}, () => {}, {});
        const mhA = mnA({ charName: 'A' }, { char: 'c_a', rows: [{ ref: 'e_down', rowId: '', name: 'Down', icon: '', gm: false, on: true, auto: true }, { ref: 'e_two', rowId: 'x_2', name: 'Two', icon: '', gm: false, on: true, auto: true }, { ref: 'e_p', rowId: '', name: 'Plain', icon: '', gm: false, on: false }] });
        check('conditions C4: the token\'s Effects menu shows an automatic effect on ticked and tagged auto; with no row to end, its line has nothing to click (no place in the list), where a row applies it too the line ends that row; the model marks it (sheets.js tokenFxModel, pinned)',
            (mhA.match(/<div class="menu-item cm-fx[^"]*"[^>]*>/g) || []).join('|') === '<div class="menu-item cm-fx on auto">|<div class="menu-item cm-fx on" data-fi="1">|<div class="menu-item cm-fx" data-fi="2">' && (mhA.match(/cm-fx-tag">auto/g) || []).length === 2
            && shA.includes("var autoOn = {}; if (c) autoEffectsOn(sys, c, F()).forEach(function(d) { autoOn[d.id] = 1; });") && shA.includes("on: (!!r && r.on !== false) || au }; if (au) row.auto = true;"), mhA);
        const pbS = slice('sheets.js', 'posturebox');
        check('conditions C3b: the System editor\'s Postures box builds with el, input, select and text nodes only — a name, a tag, notes and a change\'s amount as values, the targets\' labels as option text; no markup from a string (nor btnRow\'s innerHTML)',
            pbS.length > 2000 && !/innerHTML|insertAdjacentHTML|outerHTML|btnRow\(/.test(pbS) && /input\('sys-posture-name field', typeof p\.name === 'string' \? p\.name : ''/.test(pbS) && /input\('sys-posture-notes field', typeof p\.notes === 'string' \? p\.notes : ''/.test(pbS) && /select\('sys-posture-target', opts, val,/.test(pbS) && /document\.createTextNode\(' Smaller target'\)/.test(pbS));
        check('conditions C3: a posture\'s chip and Properties escape what a system file or the host names — the chip its tag and its name, a smaller target\'s line fixed text; Properties\' select every id and name (pinned)',
            wbP.includes("if (postAt && postAt.i > 0 && postAt.p) stanceHtml += '<span class=\"chip post\" title=\"' + esc(postAt.p.name) + (postAt.p.small === true ? '&#10;' + esc(POSTURE_RANGED_LINE) : '') + '\">' + esc(postAt.p.tag) + '</span>';")
            && inspP.replace(/\r\n/g, '\n').includes("html += '<div class=\"field\"><label for=\"wbPosture\">Posture</label><select id=\"wbPosture\">' + stanceApi.postures().map(function(p, i) { return '<option value=\"' + esc(p.id) + '\"' + (i === curPI ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></div>'; }"));
    }
    /* ---- item 21 V1: the GM's Video panel — names, numbers and ids from a campaign file reach its markup through esc; a video element's address only through videoSrc ---- */
    {
        const VC = await import(modUrl('videocore.js'));
        const vp = new Function('esc', 'fmtDur', 'fmtSize', 'sumLine', slice('video.js', 'videopanel') + '\nreturn { rowsHtml: rowsHtml, bodyHtml: bodyHtml, metaOf: metaOf };')(SC.esc, VC.fmtDur, VC.fmtSize, VC.sumLine);
        const hostile = [{ id: P, name: T, path: '/saves/images/video/c/a.mp4', size: 10, dur: 3, w: T, h: 2 }, { id: 'v_abcdefgh', name: P, path: U, size: 1 }];
        const hB = vp.bodyHtml(true, hostile, P, { name: T + P, pct: 50 }), hOff = vp.bodyHtml(false, hostile, null, null);
        const cleaned = VC.cleanVideos([{ id: 'v_abcdefgh', name: T + P, path: '/saves/images/video/c/k_x.mp4', size: 5 }]), hC = vp.bodyHtml(true, cleaned, 'v_abcdefgh', null);
        check('item 21 V1 the Video panel: a hostile name, id, picture size or upload name (even raw, before any cleaner) renders as text and values only — nothing in the panel can run or call out, no path ever reaches its markup; switched off it says so and lists nothing',
            risks(hB).length === 0 && hB.indexOf(T) < 0 && hB.indexOf('onmouseover="') < 0 && hB.indexOf(U) < 0 && hB.indexOf('/saves/images/video') < 0 && hB.indexOf(SC.esc(T)) >= 0
            && risks(hC).length === 0 && hC.indexOf('value="' + SC.esc(T + P) + '"') >= 0 && hC.indexOf('class="vid-row active" data-id="v_abcdefgh"') >= 0
            && !/vid-row|<input/.test(hOff) && /Video is off for this campaign/.test(hOff), [risks(hB), risks(hC)]);
        const srcs = [U, '//evil.example/x.mp4', 'javascript:alert(1)//.mp4', '/saves/images/video/c/../../data.json', '/saves/images/video/c/x.html', '/saves/images/map/x.mp4', '/saves/images/video/c/a b.mp4', '/saves/images/video/c/x.mp4?q=1', '/saves/images/video/c/%2e%2e.mp4', '/saves/images/video/c/.hidden.mp4', null, 5].map(VC.videoSrc);
        check('item 21 V1 a video element\'s address comes only from videoSrc: an uploaded video\'s path with its file name encoded (a name in any script), never a web address, a scheme, a walk, a page, a picture folder, a space, a query or a percent sign',
            srcs.every(x => x === '') && VC.videoSrc('/saves/images/video/camp_1/k3_Überfahrt\u00e9.mp4') === '/saves/images/video/camp_1/' + encodeURIComponent('k3_Überfahrt\u00e9.mp4') && VC.videoSrc('/saves/images/video/c/k_(1).webm') === '/saves/images/video/c/k_(1).webm', srcs);
        const vjs = read('video.js');
        // item 21 V2: the stage's table row — the players connected come from the roster (a peer's own name and profile id)
        const vt = new Function('esc', slice('video.js', 'videotable') + '\nreturn tableHtml;')(SC.esc);
        const tPick = vt({ host: true, live: false, loop: false, all: false, players: [{ id: P, name: T, on: true }, { id: 'u_b', name: P, on: false }], words: '' });
        const tAll = vt({ host: true, live: false, loop: true, all: true, players: [{ id: 'u_a', name: 'Pat', on: false }], words: '' });
        const tLive = vt({ host: true, live: true, loop: false, all: true, players: [{ id: 'u_a', name: 'Pat', on: true }], words: 'Showing to everyone: ' + T + P });
        const tSolo = vt({ host: false, live: false, loop: false, all: true, players: [{ id: 'u_a', name: T, on: true }], words: T });
        check('item 21 V2 the stage\'s table row (tableHtml, run for real): a hostile player name or profile id renders as text and a data attribute only; chosen players each a tick by their profile, Everyone ticking and locking them all; while it shows, Stop and the line of who it reaches as text, no ticks; with no table hosted, a note and Loop alone',
            [tPick, tAll, tLive, tSolo].every(h => risks(h).length === 0 && h.indexOf(T) < 0 && h.indexOf('onmouseover="') < 0)
            && tPick.indexOf('data-pid="' + SC.esc(P) + '" checked> ' + SC.esc(T) + '</label>') >= 0 && tPick.indexOf('class="vid-who" data-pid="u_b"> ' + SC.esc(P) + '</label>') >= 0 && /class="tool vid-go"/.test(tPick) && !/vid-stop/.test(tPick) && /class="vid-all"> Everyone/.test(tPick) && /class="vid-loop"> Loop/.test(tPick)
            && /class="vid-all" checked> Everyone/.test(tAll) && /class="vid-who" data-pid="u_a" disabled checked> Pat/.test(tAll) && /class="vid-loop" checked> Loop/.test(tAll)
            && /class="tool vid-stop"/.test(tLive) && !/vid-go|vid-who|vid-all/.test(tLive) && tLive.indexOf('&#9679; ' + SC.esc('Showing to everyone: ' + T + P) + '</span>') >= 0
            && !/vid-go|vid-stop|vid-who|vid-all/.test(tSolo) && /Host a table/.test(tSolo) && /class="vid-loop"> Loop/.test(tSolo), [risks(tPick), risks(tLive), tPick.slice(0, 500)]);
        check('item 21 video.js writes markup in two places only (the body from bodyHtml, the stage\'s table row from tableHtml); the caption, the progress line, a player\'s chip and note as text; a video element\'s address only from videoSrc, and a player\'s picture only as the stream net.js hands over (never an address)',
            (vjs.match(/innerHTML/g) || []).length === 2 && /ui\('videoBody'\)\.innerHTML = bodyHtml\(on, list, showing, uploading\);/.test(vjs) && /tableSig = sig; box\.innerHTML = tableHtml\(m\);/.test(vjs) && !/insertAdjacentHTML|outerHTML|document\.write/.test(vjs)
            && (vjs.match(/\.srcObject = /g) || []).length === 2 && /if \(vl\.srcObject !== stream\) vl\.srcObject = stream;/.test(vjs) && /vl\.srcObject = null;/.test(vjs)
            && /if \(ct\) ct\.textContent = watch \? watch\.name : '';/.test(vjs) && /ui\('videoCaption'\)\.textContent = watch\.lost \? /.test(vjs) && /if \(note\) note\.textContent = /.test(vjs) && /watch\.name = cleanName\(name, 'Video'\);/.test(vjs)
            && /src = v \? videoSrc\(v\.path\) : ''/.test(vjs) && (vjs.match(/\.src = /g) || []).length === 2 && /el\.src = src;/.test(vjs) && /v\.src = url;/.test(vjs)
            && /ui\('videoCaption'\)\.textContent = /.test(vjs) && /s\.textContent = 'Adding ' \+ uploading\.name/.test(vjs));
    }
    {   // music from another campaign: the Music panel's picker (music.js, sliced by its musicpick markers), run on a page that records every node
        const MU = await import(modUrl('musiccore.js')), muSrc = read('music.js'), pickSrc = slice('music.js', 'musicpick');
        const lineOfM = k => { const i = muSrc.indexOf('\n' + k); if (i < 0) throw new Error('sinkcheck: music.js ' + k + ' not found'); return muSrc.slice(i + 1, muSrc.indexOf('\n', i + 1)); };
        const campMusicSrc = muSrc.slice(muSrc.indexOf('\nfunction campMusic(camp) {') + 1, muSrc.indexOf('\nfunction campMusicW('));
        const HOST = '<img src=x onerror=alert(1)>', QUO = '"><script>x</script>';
        const mkPick = (campaigns, activeId, canWrite) => {
            const made = [], htmlSet = [], calls = { saves: 0, syncs: 0, toasts: [], renders: 0 };
            const fake = tag => { const e = { tag, children: [], style: {}, className: '', textContent: '', listeners: {}, appendChild(k) { this.children.push(k); return k; }, addEventListener(t, f) { this.listeners[t] = f; } };
                ['innerHTML', 'outerHTML'].forEach(p => Object.defineProperty(e, p, { set(v) { htmlSet.push(v); }, get() { return ''; } })); e.insertAdjacentHTML = (w, v) => { htmlSet.push(v); }; e.setAttribute = (k, v) => { htmlSet.push('attr:' + k + '=' + v); }; made.push(e); return e; };
            function Option(text, value) { const o = fake('option'); o.text = String(text); o.value = value; return o; }
            const env = { state: { appState: { campaigns } }, active: () => (Object.prototype.hasOwnProperty.call(campaigns, activeId) ? campaigns[activeId] : null), MU, safeId: SND.safeId, document: { createElement: fake }, Option,
                canWrite: () => canWrite !== false, save: () => { calls.saves++; }, net: () => ({ syncMusic: () => { calls.syncs++; } }), toast: m => calls.toasts.push(m), renderPanel: () => { calls.renders++; } };
            const api = new Function('env', "'use strict';\nvar state = env.state, getActiveCampaign = env.active, cleanMusic = env.MU.cleanMusic, bringPlan = env.MU.bringPlan, safeId = env.safeId, document = env.document, Option = env.Option, canWrite = env.canWrite, save = env.save, net = env.net, toast = env.toast, renderPanel = env.renderPanel, picking = null, selPl = null;\n"
                + lineOfM('function el(tag, cls, text) {') + '\n' + campMusicSrc + '\n' + lineOfM('function campMusicW(camp) {') + '\n' + pickSrc
                + '\nreturn { pickSource: pickSource, otherMusicCamps: otherMusicCamps, campNameOfFolder: campNameOfFolder, renderPicker: renderPicker, bringPicked: bringPicked, pick: function(v) { if (v !== undefined) picking = v; return picking; }, selPl: function() { return selPl; } };')(env);
            api.made = made; api.htmlSet = htmlSet; api.calls = calls; api.fake = fake; return api;
        };
        const fa = n => '/saves/images/audio/src1/' + n + '.mp3';
        const camps = () => { const c = {
            me: { id: 'me', name: 'Mine', music: { v: 1, tracks: [{ id: 't_own', name: 'Own', path: '/saves/images/audio/me/own.mp3', size: 5 }, { id: 't_had', name: 'Had', path: fa('two'), size: 20 }], playlists: [] } },
            src1: { id: 'src1', name: HOST, music: { v: 1, tracks: [{ id: 't_1', name: HOST, path: fa('one'), size: 10, dur: 1 }, { id: 't_2', name: QUO, path: fa('two'), size: 20, dur: 2 }, { id: 't_bad', name: 'Web', path: 'https://evil.example/a.mp3', size: 1 }], playlists: [{ id: 'pl_1', name: QUO, tracks: ['t_1', 't_2'] }] } },
            empty: { id: 'empty', name: 'No music', music: { v: 1, tracks: [], playlists: [] } },
            webOnly: { id: 'webOnly', name: 'Only a web address', music: { tracks: [{ id: 't_w', name: 'W', path: 'https://evil.example/b.mp3', size: 1 }] } },
            theirs: { id: 'theirs', name: 'Another GM\'s', _foreign: true, music: { tracks: [{ id: 't_f', name: 'F', path: '/saves/images/audio/theirs/f.mp3', size: 1 }] } },
            gone: null, text: 'x',
            src2: { id: 'src2', name: 'Second', music: { tracks: [{ id: 't_s2', name: 'S2 song', path: '/saves/images/audio/src2/s.mp3', size: 3 }], playlists: [] } } }; return c; };
        const cs = camps(), P = mkPick(cs, 'me');
        check('music picker: a source is found by its own key only — never this campaign, another GM\'s kept copy, an entry that is no campaign, an id that is no text, or a name a prototype holds; the list offers only campaigns with a song players could be sent',
            P.pickSource('src1') === cs.src1 && P.pickSource('me') === null && P.pickSource('theirs') === null && P.pickSource('gone') === null && P.pickSource('text') === null && P.pickSource('nope') === null && P.pickSource('__proto__') === null && P.pickSource('constructor') === null && P.pickSource('toString') === null && P.pickSource(7) === null && P.pickSource(null) === null
            && JSON.stringify(P.otherMusicCamps()) === JSON.stringify([{ id: 'src1', name: HOST, n: 2 }, { id: 'src2', name: 'Second', n: 1 }]), JSON.stringify(P.otherMusicCamps()));
        P.pick({ to: 'me', from: 'nope', pl: Object.create(null), tr: Object.create(null) });
        const lib = P.fake('div'); P.made.length = 0; P.renderPicker(lib);
        const texts = P.made.map(e => e.tag === 'option' ? e.text : e.textContent).filter(Boolean), rows = P.made.filter(e => e.className === 'music-pick-name').map(e => e.textContent), boxes = P.made.filter(e => e.tag === 'input'), bringB = P.made.filter(e => /music-pick-bring/.test(e.className))[0];
        check('music picker: hostile campaign, playlist and song names are written as text nodes and an option\'s text only — the sliced source and the page record no innerHTML, outerHTML, insertAdjacentHTML or setAttribute; a stale source falls back to the first campaign on offer; a song this campaign already lists is not offered again; nothing is ticked and Bring is off until something is',
            P.htmlSet.length === 0 && !/innerHTML|outerHTML|insertAdjacentHTML|setAttribute|document\.write/.test(pickSrc) && texts.indexOf(HOST + ' (2)') >= 0 && P.pick().from === 'src1'
            && JSON.stringify(rows) === JSON.stringify([QUO + '  (2)', HOST]) && boxes.length === 2 && boxes.every(b => b.type === 'checkbox' && b.checked === false) && bringB.disabled === true && bringB.textContent === 'Bring 0 into Mine', JSON.stringify([rows, texts.slice(0, 6)]));
        boxes[0].checked = true; boxes[0].listeners.change(); boxes[1].checked = true; boxes[1].listeners.change();
        const ticked = [Object.keys(P.pick().pl), Object.keys(P.pick().tr), bringB.textContent, bringB.disabled];
        boxes[0].checked = false; boxes[0].listeners.change();
        const unticked = [Object.keys(P.pick().pl), Object.keys(P.pick().tr), bringB.textContent];
        const before = JSON.stringify(cs.src1), want = MU.bringPlan(cs.me.music, cs.src1.music, { playlists: [], tracks: ['t_1'] }, { rand: () => 0.25 });
        bringB.listeners.click();
        const got = cs.me.music, afterSong = [got.tracks.length, got.playlists.length, P.calls.saves, P.calls.syncs, P.selPl(), P.pick()];
        P.pick({ to: 'me', from: 'src1', pl: Object.assign(Object.create(null), { pl_1: 1 }), tr: Object.create(null) }); P.bringPicked();
        check('music picker: ticking and unticking count on the button; Bring appends exactly what bringPlan gives — the ticked song under a new id with the same path, then the playlist with its songs (the new song, and the one already here reused) —, saves and sends the table the library once each time, selects a brought playlist, says what came and closes the picker; the other campaign is untouched',
            JSON.stringify(ticked) === JSON.stringify([['pl_1'], ['t_1'], 'Bring 2 into Mine', false]) && JSON.stringify(unticked) === JSON.stringify([[], ['t_1'], 'Bring 1 into Mine'])
            && JSON.stringify(afterSong) === JSON.stringify([3, 0, 1, 1, null, null]) && got.tracks[2].path === fa('one') && got.tracks[2].name === HOST && got.tracks[2].id !== 't_1' && want.tracks.length === 1 && want.tracks[0].path === got.tracks[2].path && want.playlists.length === 0
            && got.tracks.length === 3 && got.playlists.length === 1 && JSON.stringify(got.playlists[0].tracks) === JSON.stringify([got.tracks[2].id, 't_had']) && got.playlists[0].name === QUO && P.calls.saves === 2 && P.calls.syncs === 2 && P.pick() === null && P.selPl() === got.playlists[0].id
            && JSON.stringify(P.calls.toasts) === JSON.stringify(['1 song brought in.', '1 playlist brought in.']) && JSON.stringify(cs.src1) === before && P.calls.renders >= 2, JSON.stringify([ticked, unticked, afterSong, got, P.calls]));
        // again: nothing new; where the campaign cannot be written, or the source is gone or is this campaign: nothing at all
        P.pick({ to: 'me', from: 'src1', pl: Object.assign(Object.create(null), { pl_1: 1 }), tr: Object.assign(Object.create(null), { t_1: 1 }) }); P.bringPicked();
        const again = [got.tracks.length, got.playlists.length, P.calls.saves, P.calls.syncs, P.calls.toasts[2]];
        const cs2 = camps(), P2 = mkPick(cs2, 'me', false); P2.pick({ to: 'me', from: 'src1', pl: Object.create(null), tr: Object.assign(Object.create(null), { t_1: 1 }) }); P2.bringPicked();
        const cs3 = camps(), P3 = mkPick(cs3, 'me'); P3.pick({ to: 'me', from: 'me', pl: Object.create(null), tr: Object.assign(Object.create(null), { t_own: 1 }) }); P3.bringPicked();
        P3.pick({ to: 'me', from: 'gone', pl: Object.create(null), tr: Object.assign(Object.create(null), { t_1: 1 }) }); P3.bringPicked(); P3.pick({ to: 'me', from: '__proto__', pl: Object.create(null), tr: Object.create(null) }); P3.bringPicked(); P3.pick(null); P3.bringPicked();
        check('music picker: bringing the same again adds nothing and saves nothing ("Nothing new to bring"); nothing is brought where the campaign cannot be written, from a source that is gone, from a prototype\'s name, or from this campaign into itself',
            JSON.stringify(again) === JSON.stringify([3, 1, 2, 2, 'Nothing new to bring: this campaign already lists them.']) && cs2.me.music.tracks.length === 2 && P2.calls.saves === 0 && P2.calls.syncs === 0 && P2.pick() === null
            && cs3.me.music.tracks.length === 2 && cs3.me.music.playlists.length === 0 && P3.calls.saves === 0 && P3.calls.syncs === 0 && P3.calls.toasts.length === 0, JSON.stringify([again, P2.calls, P3.calls]));
        check('music picker: a brought-in song\'s tag names the campaign whose folder its file lies in, as text — "another campaign" when that campaign is gone or the folder is none',
            P.campNameOfFolder('src1') === HOST && P.campNameOfFolder('nope') === 'another campaign' && P.campNameOfFolder('') === 'another campaign' && P.campNameOfFolder('gone') === 'another campaign' && P.campNameOfFolder('__proto__') === 'another campaign'
            && /var fr = el\('span', 'music-from', 'from ' \+ campNameOfFolder\(folderOf\(tr\.path\)\)\); fr\.title = /.test(muSrc) && !/innerHTML/.test(muSrc.slice(muSrc.indexOf('function renderPanel()'))));
        // the From list, a redraw while picking, and Cancel
        const csS = camps(), PS = mkPick(csS, 'me'); PS.pick({ to: 'me', from: 'src1', pl: Object.create(null), tr: Object.create(null) }); PS.made.length = 0; PS.renderPicker(PS.fake('div'));
        const selS = PS.made.filter(e => e.tag === 'select')[0], optsS = PS.made.filter(e => e.tag === 'option'), boxS = PS.made.filter(e => e.tag === 'input');
        boxS[1].checked = true; boxS[1].listeners.change(); PS.made.length = 0; PS.renderPicker(PS.fake('div')); const reBox = PS.made.filter(e => e.tag === 'input');
        const r0 = PS.calls.renders; selS.value = 'src2'; selS.listeners.change(); const afterSel = [PS.pick().from, Object.keys(PS.pick().pl).length, Object.keys(PS.pick().tr).length, PS.calls.renders - r0];
        PS.made.length = 0; PS.renderPicker(PS.fake('div'));
        const rows2 = PS.made.filter(e => e.className === 'music-pick-name').map(e => e.textContent), opts2 = PS.made.filter(e => e.tag === 'option'), cancelS = PS.made.filter(e => e.tag === 'button' && e.textContent === 'Cancel')[0];
        const r1 = PS.calls.renders; cancelS.listeners.click();
        const csT = camps(); csT.me.music = { v: 1, tracks: [], playlists: [] }; const PT = mkPick(csT, 'me'); PT.pick({ to: 'me', from: 'src1', pl: Object.assign(Object.create(null), { pl_1: 1 }), tr: Object.create(null) }); PT.bringPicked();
        check('music picker: the From list holds each campaign on offer by its id (its name and count as the option\'s text), the one being picked from selected; choosing another empties the ticks, redraws and lists that campaign\'s rows; a tick stands through a redraw; Cancel closes the picker and redraws, nothing saved; a playlist with two new songs says "2 songs and 1 playlist brought in."',
            JSON.stringify(optsS.map(o => [o.value, o.text, !!o.selected])) === JSON.stringify([['src1', HOST + ' (2)', true], ['src2', 'Second (1)', false]]) && reBox.length === 2 && reBox[0].checked === false && reBox[1].checked === true
            && JSON.stringify(afterSel) === JSON.stringify(['src2', 0, 0, 1]) && JSON.stringify(rows2) === JSON.stringify(['S2 song']) && JSON.stringify(opts2.map(o => [o.value, !!o.selected])) === JSON.stringify([['src1', false], ['src2', true]])
            && PS.pick() === null && PS.calls.renders === r1 + 1 && PS.calls.saves === 0 && JSON.stringify(PT.calls.toasts) === JSON.stringify(['2 songs and 1 playlist brought in.']) && csT.me.music.tracks.length === 2, JSON.stringify([optsS.map(o => [o.value, o.text, !!o.selected]), reBox.map(b => b.checked), afterSel, rows2, PT.calls.toasts]));
        const cs4 = camps(), P4 = mkPick(cs4, 'me'); P4.pick({ to: 'other', from: 'src1', pl: Object.create(null), tr: Object.assign(Object.create(null), { t_1: 1 }) }); P4.bringPicked();
        const full = camps(); full.me.music.tracks = Array.from({ length: MU.LIMITS.trackDefs }, (_, i) => ({ id: 'k' + i, name: 'K', path: '/saves/images/audio/me/k' + i + '.mp3', size: 1 }));
        const P5 = mkPick(full, 'me'); P5.pick({ to: 'me', from: 'src1', pl: Object.create(null), tr: Object.assign(Object.create(null), { t_1: 1 }) }); P5.bringPicked();
        const arr = camps(); arr.me.music = []; const P6 = mkPick(arr, 'me'); P6.pick({ to: 'me', from: 'src1', pl: Object.create(null), tr: Object.assign(Object.create(null), { t_1: 1 }) }); P6.bringPicked();
        check('music picker: a picker opened in one campaign brings nothing once another is the open one; with the library full it says that nothing was brought and how many were left out, never that the campaign already lists them; a campaign whose stored music is a list is given a music object, so what is brought is saved',
            cs4.me.music.tracks.length === 2 && P4.calls.saves === 0 && P4.calls.toasts.length === 0 && P4.pick() === null
            && full.me.music.tracks.length === MU.LIMITS.trackDefs && P5.calls.saves === 0 && JSON.stringify(P5.calls.toasts) === JSON.stringify(['Nothing was brought in. 1 left out: the music library is full.'])
            && !Array.isArray(arr.me.music) && JSON.parse(JSON.stringify(arr.me)).music.tracks.length === 1 && P6.calls.saves === 1, JSON.stringify([P4.calls, P5.calls, P6.calls]));
    }
    delete global.window;

    /* ---- links (1.5.0): the Journal's addresses drawn as links, and asking before a link from someone else opens (linkgate.js sliced by its
            linkgate markers, handouts.js by its viewer / journalopen / journalnote markers, the app's own question from dialogs.js — all run for
            real on the page of plain objects, which throws on any markup written from a string) ---- */
    {
        const TFl = await import(modUrl('textfmt.js')), { makeDom } = require('./boxdom.js');
        const gateSrc = slice('linkgate.js', 'linkgate'), hoAll = read('handouts.js'), dlgAll = read('dialogs.js'), dlgSrc = dlgAll.slice(dlgAll.indexOf('  var _confirmQueue = [];'), dlgAll.indexOf('  function isCampaignNameTaken'));
        const J = v => JSON.stringify(v), OK = 'https://ok.example/p?a=1&b=2', ASK = 'Open this link in your web browser?';
        const mkGate = () => new Function('cleanLink', 'linkParts', 'URL', gateSrc + '\nreturn { linkVerdict, linkWhere, readUrl, askBody, linkGate, wireLinks, fillLinked, atTable };')(TFl.cleanLink, TFl.linkParts, URL);
        const G0 = mkGate();

        // the rule, as a pure function: where the link is, whose the entry is, whether this app is a player -> none | open | ask
        const V = (o) => G0.linkVerdict(Object.assign({ link: OK, editing: false, zone: 'other', own: false, player: false }, o));
        const zones = ['viewer', 'app', 'page', 'other', 'x', undefined, null, 7], owns = [true, false, '1', 1, undefined, null], players = [true, false, null, undefined, 'no', 0];
        let ruleBad = null, opens = 0, asks = 0;
        zones.forEach(z => owns.forEach(o => players.forEach(p => { const got = V({ zone: z, own: o, player: p }), want = (z === 'app' || (z === 'viewer' && o === true) || (z === 'page' && p === false)) ? 'open' : 'ask'; if (got !== want) ruleBad = ruleBad || [z, o, p, got]; if (got === 'open') opens++; else asks++; })));
        check('links (the rule, run for real over every combination of place, owner and role): a link opens directly only in the app\'s own words, in the handout viewer when the Journal says the entry is yours, and on a planner or a page while this app is known NOT to be a player at someone\'s table; everything else asks — a received entry on any machine, a page on a player\'s screen, a place the rule does not name, and whatever cannot be told (it fails closed)',
            !ruleBad && opens === 36 + 6 + 6 && asks === zones.length * owns.length * players.length - opens && V({ zone: 'viewer', own: true, player: true }) === 'open' && V({ zone: 'viewer', own: false, player: false }) === 'ask' && V({ zone: 'page', player: null }) === 'ask' && V({ zone: 'page' , player: undefined }) === 'ask', ruleBad || [opens, asks]);
        check('links (the rule): nothing opens at all for an address the link rule does not keep, for one in a box that is being edited, and for a context that is none',
            ['', 'javascript:alert(1)', 'data:text/html,x', ' https://a.example/', 'https://a b', 'ftp://a.example/', '//a.example/', '/api/data', '#', 'mailto:a@b.example', 'https://' + 'a'.repeat(1993), 7, null, undefined, { toString() { return OK; } }].every(l => ['viewer', 'app', 'page', 'other'].every(z => V({ link: l, zone: z, own: true, player: false }) === 'none'))
            && ['viewer', 'app', 'page', 'other'].every(z => V({ zone: z, own: true, editing: true }) === 'none' && V({ zone: z, own: true, editing: undefined }) === 'none' && V({ zone: z, own: true, editing: 0 }) === 'none') && [null, undefined, 'x', 7].every(c => G0.linkVerdict(c) === 'none'));

        // a page of plain objects with the app's places, the app's own question, and the listener wired
        const mkPage = (o) => {
            o = o || {};
            const dom = makeDom(), doc = dom.document, opened = [], W = { open: (u, t, f) => { opened.push([u, t, f]); return null; } };
            if ('net' in o) W.wpNet = o.net;
            if (o.popout) { W.wpPopout = true; if ('opener' in o) Object.defineProperty(W, 'opener', { get: typeof o.opener === 'function' ? o.opener : () => o.opener }); }
            doc.removeEventListener = (ev, fn, cap) => { const l = dom.page.docHandlers[(cap ? 'c:' : 'b:') + ev] || [], i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
            const el = (tag, id, parent) => { const e = doc.createElement(tag); if (id) e.id = id; (parent || doc.body).appendChild(e); return e; };
            const cc = el('div', 'customConfirm'), ccBox = el('div', '', cc), ccTitle = el('h3', 'customConfirmTitle', ccBox), ccRow = el('div', '', ccBox), ccNo = el('button', 'customConfirmCancel', ccRow), ccOk = el('button', 'customConfirmOk', ccRow);
            const P = { dom, doc, W, opened, cc, ccBox, ccTitle, ccNo, ccOk, z: {} };
            ['handoutModal', 'helpModal', 'aboutModal', 'settingsModal', 'plannerPreview', 'docReaderBody', 'docPanelBody', 'popoutBody', 'chatLog', 'whiteboard'].forEach(id => { P.z[id] = el('div', id); });
            P.z.editing = el('div', 'rteBody'); P.z.editing.setAttribute('contenteditable', 'true'); P.z.editingIn = el('p', '', P.z.editing);
            P.clock = { t: 1000000 };   // the question's own clock: nothing here waits for real
            P.timers = [];   // a timer with no delay runs at once (the next question in the queue); one with a delay waits to be run by hand
            P.dlg = new Function('document', 'setTimeout', 'clearTimeout', 'Date', dlgSrc + '\nreturn { showConfirm, showAlert };')(doc, (fn, ms) => { if (!ms) { fn(); return 0; } P.timers.push({ fn, ms, on: true }); return P.timers.length; }, id => { if (P.timers[id - 1]) P.timers[id - 1].on = false; }, { now: () => P.clock.t });
            P.showConfirm = P.dlg.showConfirm;
            P.api = mkGate(); P.api.wireLinks(W, doc, P.showConfirm);
            P.link = (zone, href, attrs) => { const a = doc.createElement('a'); if (href !== undefined) a.setAttribute('href', href); Object.keys(attrs || {}).forEach(k => a.setAttribute(k, attrs[k])); a.appendChild(doc.createTextNode('the link')); (typeof zone === 'string' ? P.z[zone] : zone).appendChild(a); return a; };
            P.click = (a, x) => dom.fire(a, 'click', Object.assign({ button: 0 }, x || {}));
            P.mid = (a, x) => dom.fire(a, 'auxclick', Object.assign({ button: 1 }, x || {}));
            P.asking = () => cc.style.display === 'flex';
            P.body = () => ccBox.childNodes.filter(n => n.id === 'customConfirmBody')[0] || null;
            P.lines = () => { const b = P.body(); return b ? b.firstChild.childNodes.map(n => [n.className, n.textContent]) : null; };
            P.key = k => (dom.page.docHandlers['b:keydown'] || []).slice().forEach(h => h({ key: k }));
            P.no = () => { if (typeof ccNo.onclick === 'function') ccNo.onclick(); }; P.press = ev => { if (typeof ccOk.onclick === 'function') ccOk.onclick(ev); }; P.yes = () => { P.clock.t += 1000; P.press({ detail: 1 }); };   // the question's own buttons (nothing when no question is up); Yes as a person gives it: one click, once the question has been up a moment
            return P;
        };
        const GM = { active: true, role: 'host', foreign: false }, PLAYER = { active: true, role: 'client', foreign: true }, ALONE = { active: false, role: null, foreign: false };

        {   // your own planners and pages: directly, the cleaned address, once
            const P = mkPage({ net: ALONE }), a = P.link('plannerPreview', '  ' + OK + ' ', { target: '_blank', rel: 'noopener noreferrer' }), e1 = P.click(a), e2 = P.mid(a), e3 = P.click(a, { ctrlKey: true }), e4 = P.click(a.firstChild), e5 = P.mid(a, { button: 2 }), e6 = P.click(a, { button: 2 });
            const H = mkPage({ net: GM }), ah = H.link('docReaderBody', OK); H.click(ah); H.click(H.link('docPanelBody', OK)); H.click(H.link('helpModal', OK)); H.click(H.link('aboutModal', OK));
            check('links (your own): a link in your planner\'s preview, your handbook reader or panel and the app\'s own words opens directly while you are not a player — a click, the middle button, Ctrl+click and a click on the link\'s text each open exactly the cleaned address in a new window with no opener, the engine\'s own following stopped; the right button is left alone; nothing is asked',
                J(P.opened) === J([[OK, '_blank', 'noopener,noreferrer'], [OK, '_blank', 'noopener,noreferrer'], [OK, '_blank', 'noopener,noreferrer'], [OK, '_blank', 'noopener,noreferrer']]) && [e1, e2, e3, e4].every(e => e.defaultPrevented) && !e5.defaultPrevented && !e6.defaultPrevented && !P.asking() && H.opened.length === 4 && !H.asking(), [P.opened, H.opened.length]);
        }
        {   // a player at a table: the GM's page asks
            const P = mkPage({ net: PLAYER }), a = P.link('docReaderBody', OK), b = P.link('docPanelBody', 'https://other.example/'), e1 = P.click(a);
            const up = P.asking(), title = P.ccTitle.textContent, lines = J(P.lines()), wide = P.ccBox.classList.contains('confirm-wide'), kids = P.body() ? P.body().all() : [];
            P.click(b); P.mid(a); P.click(a); const still = [P.asking(), P.opened.length, ccCount(P)];
            P.key('Enter'); const afterEnter = [P.asking(), P.opened.length];
            P.no(); const afterNo = [P.asking(), P.opened.length, !!P.body(), P.ccBox.classList.contains('confirm-wide'), (P.dom.page.docHandlers['b:keydown'] || []).length];
            P.click(a); const again = P.asking(); P.key('Escape'); const afterEsc = [P.asking(), P.opened.length];
            P.click(b); const forB = J(P.lines()); P.yes(); const afterYes = [P.asking(), J(P.opened), !!P.body()];
            P.click(a); P.yes(); P.click(a); P.no();
            check('links (from someone else): on a player\'s screen a link on the GM\'s page opens nothing by itself — the click is stopped and the app\'s own question comes up, its words text nodes in elements the app makes: who it came from (the GM), the site on a line of its own, then the whole address; the box is widened for it',
                e1.defaultPrevented && up && title === ASK && lines === J([['linkask-from', 'It came from the GM.'], ['linkask-label', 'It leads to the site'], ['linkask-site', 'ok.example'], ['linkask-label', 'The whole address'], ['linkask-url', OK]]) && wide
                && kids.length === 6 && kids.every(n => n.nodeName === 'DIV' && !Object.keys(n.attrs).length && !Object.keys(n.handlers).length && n.childNodes.every(c => c.nodeType === 3 || c.nodeName === 'DIV')), [up, title, lines]);
            check('links (from someone else): one question at a time — a click on another link, a middle click and a second click while it is up ask nothing more and open nothing; Enter does not answer it; No and Escape close it and open nothing (the box as it was, its key handler gone); a click after that asks again; Yes opens exactly the cleaned address of the link that was asked about, once',
                J(still) === J([true, 0, 1]) && J(afterEnter) === J([true, 0]) && J(afterNo) === J([false, 0, false, false, 0]) && again && J(afterEsc) === J([false, 0]) && forB === J([['linkask-from', 'It came from the GM.'], ['linkask-label', 'It leads to the site'], ['linkask-site', 'other.example'], ['linkask-label', 'The whole address'], ['linkask-url', 'https://other.example/']])
                && J(afterYes) === J([false, J([['https://other.example/', '_blank', 'noopener,noreferrer']]), false]) && J(P.opened) === J([['https://other.example/', '_blank', 'noopener,noreferrer'], [OK, '_blank', 'noopener,noreferrer']]), [still, afterEnter, afterNo, afterEsc, afterYes, P.opened]);
        }
        function ccCount(P) { return P.ccBox.childNodes.filter(n => n.id === 'customConfirmBody').length; }
        {   // a refused address is never opened, whoever and wherever
            const BAD = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'file:///c:/x', 'ftp://a.example/x', 'mailto:a@b.example', '//evil.example/x', '/api/data', '/saves/data.json', '#', '', 'https://a b', 'https://' + 'a'.repeat(1993), 'https://javascript:alert(1)', 'https://a.example:99999/', 'http://[::1', 'https://'];
            const res = [];
            [ALONE, GM, PLAYER, undefined].forEach(net => { const P = mkPage(net === undefined ? {} : { net }); P.z.handoutModal.dataset.linksOwn = '1';
                ['handoutModal', 'helpModal', 'plannerPreview', 'docReaderBody', 'chatLog'].forEach(z => BAD.forEach(h => { const a = P.link(z, h, { target: '_blank' }), e = [P.click(a), P.mid(a), P.click(a, { ctrlKey: true })]; res.push(e.every(x => x.defaultPrevented) && !P.asking() && P.opened.length === 0); })); });
            const P = mkPage({ net: ALONE }), none = P.link('plannerPreview', undefined), eN = P.click(none), dl = P.link('whiteboard', 'blob:http://127.0.0.1:3999/1f2e', { download: 'campaign.json' }), eD = P.click(dl), dd = P.link('whiteboard', 'data:application/json,{}', { download: 'x.json' }), eDD = P.click(dd), dw = P.link('plannerPreview', OK, { download: 'x' }), eW = P.click(dw);
            check('links (the second check, at the click): an address the link rule does not keep — a script address, data:, another scheme, a mail address, a local or protocol-relative one, one with a space, an over-long one — and one the URL parser cannot read is not opened at all: no window, no question, for a click, a middle click and Ctrl+click, in every place and role; an <a> with no href is not a link; a file the app itself hands over to be saved (download, blob: or data:) is left alone, and a download attribute on a web address changes nothing',
                res.length === 4 * 5 * BAD.length && res.every(Boolean) && !eN.defaultPrevented && !eD.defaultPrevented && !eDD.defaultPrevented && eW.defaultPrevented && J(P.opened) === J([[OK, '_blank', 'noopener,noreferrer']]), [res.filter(x => !x).length, P.opened]);
        }
        {   // in a box that is being edited a link is never followed
            const out = [GM, PLAYER, ALONE].map(net => { const P = mkPage({ net }), a = P.link(P.z.editingIn, OK), e = [P.click(a), P.mid(a), P.click(a, { ctrlKey: true }), P.click(a, { shiftKey: true })]; return e.every(x => x.defaultPrevented) && P.opened.length === 0 && !P.asking(); });
            check('links (editing): in a box that is being edited a link is not followed — a click, a middle click, Ctrl+click and Shift+click open nothing and ask nothing', out.every(Boolean), out);
        }
        {   // who is asked: places and windows
            const where = (net, zone, more) => { const P = mkPage(Object.assign(net === undefined ? {} : { net }, more || {})), a = P.link(zone, OK); P.click(a); return P.opened.length ? 'open' : P.asking() ? P.lines()[0][1] : 'nothing'; };
            const GMsaid = 'It came from the GM.', UNK = 'It may have been written by someone else.';
            const got = { gmPreview: where(GM, 'plannerPreview'), gmReader: where(GM, 'docReaderBody'), gmPanel: where(GM, 'docPanelBody'), gmElse: where(GM, 'whiteboard'), gmChat: where(GM, 'chatLog'), plReader: where(PLAYER, 'docReaderBody'), plPanel: where(PLAYER, 'docPanelBody'), plHelp: where(PLAYER, 'helpModal'), plAbout: where(PLAYER, 'aboutModal'), plSettings: where(PLAYER, 'settingsModal'), plElse: where(PLAYER, 'whiteboard'),
                reconnecting: where({ active: false, role: 'client', foreign: true }, 'docReaderBody'), stream: where({ active: false, foreign: true, stream: true }, 'docReaderBody'), noNet: where(undefined, 'plannerPreview'), oddNet: where('yes', 'plannerPreview'),
                popGm: where(undefined, 'popoutBody', { popout: true, opener: { wpNet: GM } }), popAlone: where(undefined, 'popoutBody', { popout: true, opener: { wpNet: ALONE } }), popPlayer: where(undefined, 'popoutBody', { popout: true, opener: { wpNet: PLAYER } }), popGone: where(undefined, 'popoutBody', { popout: true, opener: null }), popClosed: where(undefined, 'popoutBody', { popout: true, opener: { closed: true, wpNet: GM } }), popBarred: where(undefined, 'popoutBody', { popout: true, opener: () => { throw new Error('another origin'); } }), popOwnNet: where(GM, 'popoutBody', { popout: true, opener: { wpNet: PLAYER } }) };
            check('links (who is asked, on the page): the GM and a player alone open their own preview, reader and panel directly; on a player\'s screen the same places ask and say the GM, also while the table is reconnecting; Help, About and Settings open directly for everyone; a place the rule does not name asks without naming anyone; the stream window asks; with no session state to read it asks; a pop-out goes by the window that opened it — and asks when that window is a player\'s, is gone, is closed or cannot be read',
                J(got) === J({ gmPreview: 'open', gmReader: 'open', gmPanel: 'open', gmElse: UNK, gmChat: UNK, plReader: GMsaid, plPanel: GMsaid, plHelp: 'open', plAbout: 'open', plSettings: 'open', plElse: UNK, reconnecting: GMsaid, stream: GMsaid, noNet: UNK, oddNet: UNK, popGm: 'open', popAlone: 'open', popPlayer: GMsaid, popGone: UNK, popClosed: UNK, popBarred: UNK, popOwnNet: GMsaid }), got);
        }
        {   // the question's words: a hostile address, a look-alike site, a hostile sender
            const HA = 'https://evil.example/"><img/src=x/onerror=alert(1)>?<script>alert(2)</script>', LOOK = 'https://\u0430\u0440\u0440\u04cf\u0435.example/login', USER = 'https://ok.example@evil.example:8443/x', NAME = '<img src=x onerror=alert(1)>"Mal';
            const ask = (href, data) => { const P = mkPage({ net: ALONE }); Object.assign(P.z.handoutModal.dataset, data || {}); P.click(P.link('handoutModal', href)); return { l: P.lines(), P }; };
            const h = ask(HA, { linksWho: NAME }), lk = ask(LOOK, { linksGm: '1' }), us = ask(USER, {}), long = ask('https://a.example/' + 'x'.repeat(1982), { linksWho: 'w'.repeat(200) }), own = ask(OK, { linksOwn: '1', linksGm: '1', linksWho: 'x' }), both = ask(OK, { linksGm: '1', linksWho: 'x' }), odd = ['true', 'yes', '0', ' 1'].map(v => ask(OK, { linksOwn: v }));
            const BIDI = 'https://ok.example/\u202egnp.exe?\u2066x\u2069#\u200f', bd = ask(BIDI, {}), ascii = s => /^[\x21-\x7e]+$/.test(s);
            check('links (the question\'s words): a hostile address and a hostile sender name are text in text nodes — never a tag; the site and the whole address are what the URL parser reads, in plain characters only: a look-alike name written in another alphabet shows in its xn-- form in both, a name in front of an @ is not the site, a port is shown, and a character that would turn the line round or hide in it (a direction override, a zero-width mark) or leave an attribute is percent-encoded; the whole address is shown uncut at its full ' + TFl.MAX_LINK + ' characters; a sender\'s name is cut to 60; what the Journal says is yours asks nothing',
                J(h.l) === J([['linkask-from', 'It came from a player: ' + NAME], ['linkask-label', 'It leads to the site'], ['linkask-site', 'evil.example'], ['linkask-label', 'The whole address'], ['linkask-url', new URL(HA).href]]) && h.P.body().all().every(n => n.nodeName === 'DIV') && ascii(h.l[4][1]) && !/[<>"]/.test(h.l[4][1]) && h.l[4][1] !== HA
                && bd.l && bd.l[2][1] === 'ok.example' && ascii(bd.l[4][1]) && bd.l[4][1] === new URL(BIDI).href && /%E2%80%AE/.test(bd.l[4][1]) && G0.readUrl('https://a.example:99999/') === null && G0.readUrl('ftp://a.example/') === null && JSON.stringify(G0.readUrl('HTTPS://A.example:443/x')) === JSON.stringify({ site: 'a.example', href: 'https://a.example/x' })
                && lk.l[0][1] === 'It came from the GM.' && /^xn--[a-z0-9-]+\.example$/.test(lk.l[2][1]) && lk.l[2][1].indexOf('\u0430') < 0 && lk.l[4][1] === new URL(LOOK).href && ascii(lk.l[4][1]) && /^https:\/\/xn--/.test(lk.l[4][1]) && us.l[0][1] === 'It may have been written by someone else.' && us.l[2][1] === 'evil.example:8443' && us.l[4][1] === USER
                && long.l[4][1].length === 2000 && long.l[0][1] === 'It came from a player: ' + 'w'.repeat(60) && own.l === null && own.P.opened.length === 1 && both.l[0][1] === 'It came from the GM.' && odd.every(x => x.l !== null && x.P.opened.length === 0), [h.l, lk.l && lk.l[2], us.l && us.l[2], own.l]);
        }

        // an SVG link as the diagram library draws one: an <a> around a shape and its label whose address is in xlink:href, not href
        // ('bare': the namespaced attribute written without its prefix; 'plain': the prefixed name with no namespace)
        const XL = 'http://www.w3.org/1999/xlink';
        const svgLink = (P, zone, href, how) => { const a = P.doc.createElement('a'), g = P.doc.createElement('g'), lab = P.doc.createElement('span'); if (how === 'plain') a.setAttribute('xlink:href', href); else a.setAttributeNS(XL, how === 'bare' ? 'href' : 'xlink:href', href); lab.appendChild(P.doc.createTextNode('Free loot here')); g.appendChild(lab); a.appendChild(g); (typeof zone === 'string' ? P.z[zone] : zone).appendChild(a); return { a, lab }; };
        {   // a diagram's link is a link like any other
            const P = mkPage({ net: PLAYER }), L = svgLink(P, 'docReaderBody', OK), had = L.a.hasAttribute('href'), e1 = P.click(L.lab), up = P.asking(), lines = J(P.lines()); P.no();
            const e2 = P.mid(L.lab.firstChild), up2 = P.asking(); P.yes(); const afterYes = J(P.opened);
            const G = mkPage({ net: ALONE }), eg = ['ns', 'bare', 'plain'].map(how => G.click(svgLink(G, 'plannerPreview', OK, how).lab));
            const BADX = ['mailto:a@b.example', 'tel:+15550100', 'ftp://a.example/x', '//evil.example/x', '/api/data', '/saves/data.json', 'javascript:alert(1)', 'data:text/html,x', '#', ''], res = [];
            [ALONE, GM, PLAYER, undefined].forEach(net => { const Q = mkPage(net === undefined ? {} : { net }); ['plannerPreview', 'docReaderBody', 'docPanelBody', 'popoutBody', 'whiteboard'].forEach(z => BADX.forEach(h => ['ns', 'bare', 'plain'].forEach(how => { const X = svgLink(Q, z, h, how), ev = [Q.click(X.lab), Q.mid(X.lab), Q.click(X.lab, { ctrlKey: true })]; res.push(ev.every(x => x.defaultPrevented) && !Q.asking() && Q.opened.length === 0); }))); });
            const N = mkPage({ net: PLAYER }), outer = svgLink(N, 'docReaderBody', OK), inner = N.doc.createElement('a'); inner.appendChild(N.doc.createTextNode('label')); outer.lab.appendChild(inner); const en = N.click(inner.firstChild), nUp = N.asking(), nSite = nUp ? N.lines()[2][1] : null;
            const B = mkPage({ net: PLAYER }), none = B.doc.createElement('a'); none.appendChild(B.doc.createTextNode('x')); B.z.docReaderBody.appendChild(none); const e0 = B.click(none);
            check('links (a diagram\'s link): a link the diagram library draws — an <a> whose address is in xlink:href and that has no href — is a link like any other: on a player\'s screen a click or a middle click on it or on its label is stopped and asks, with the site and the whole address, and Yes opens the cleaned address once; on your own page it opens directly, however the attribute is written; an address the link rule does not keep (a mail or phone address, another scheme, a local or protocol-relative one, a script address) opens nothing and asks nothing in every place and role, the engine\'s own following stopped; an <a> with no address inside one that has one goes by the one around it; an <a> with none at all is no link',
                !had && e1.defaultPrevented && up && lines === J([['linkask-from', 'It came from the GM.'], ['linkask-label', 'It leads to the site'], ['linkask-site', 'ok.example'], ['linkask-label', 'The whole address'], ['linkask-url', OK]]) && e2.defaultPrevented && up2 && afterYes === J([[OK, '_blank', 'noopener,noreferrer']])
                && eg.every(e => e.defaultPrevented) && J(G.opened) === J([[OK, '_blank', 'noopener,noreferrer'], [OK, '_blank', 'noopener,noreferrer'], [OK, '_blank', 'noopener,noreferrer']]) && !G.asking()
                && res.length === 4 * 5 * BADX.length * 3 && res.every(Boolean) && en.defaultPrevented && nUp && nSite === 'ok.example' && !e0.defaultPrevented && !B.asking() && B.opened.length === 0, [had, e1.defaultPrevented, up, lines, afterYes, G.opened.length, res.filter(x => !x).length, en.defaultPrevented, nUp]);
        }
        {   // a script's window.open never loads an address into the window it is made from — the diagram library binds a Gantt chart's task to
            // window.open(address, '_self') whatever its mode, and by the task's id on the whole page, so on an element of the app's too
            const P = mkPage({ net: ALONE }), W = P.W; W.name = 'wpPopout_d1';
            const SELF = [['https://ok.example/a', '_self'], ['https://ok.example/b', '_SELF'], ['/api/prefs.js', ' _top '], ['https://ok.example/c', '_parent'], ['https://ok.example/d', 'wpPopout_d1'], ['https://ok.example/e', { toString() { return '_self'; } }], ['https://ok.example/f', { toString() { throw new Error('x'); } }]];
            const refused = SELF.map(c => W.open(c[0], c[1]));
            const passed = [W.open(OK, '_blank', 'noopener,noreferrer'), W.open('http://127.0.0.1:3999/?popout=chat:', 'wpPopout_chat', 'width=440,height=760'), W.open(OK)];
            const btn = P.doc.createElement('button'); btn.id = 'plannerUndoBtn'; P.z.whiteboard.appendChild(btn); btn.addEventListener('click', () => { W.open('https://evil.example/x', '_self'); });
            const task = P.doc.createElement('rect'); task.id = 't1'; P.z.docReaderBody.appendChild(task); task.addEventListener('click', () => { W.open('/api/prefs.js', '_self'); });
            P.click(btn); P.click(task); P.mid(task);
            const byLink = P.link('plannerPreview', OK); P.click(byLink); const inner = W.open; P.api.wireLinks(W, P.doc, P.showConfirm); const wired = W.open('https://ok.example/g', '_self'), same = W.open === inner;
            check('links (a script\'s window.open): the window a call is made from is never steered to an address — a call whose target is _self, _parent or _top in any case or with spaces round it, or the window\'s own name, opens nothing and answers null, so the click the diagram library binds to a Gantt chart\'s task (window.open(address, \'_self\')), on the drawing or on an element of the app\'s that shares the task\'s id, does nothing; a new window (_blank, a pop-out\'s own name, no target) opens as it was asked, and a link still opens through the one rule; wired twice it is the same',
                refused.every(r => r === null) && wired === null && same && passed.every(r => r === null) && J(P.opened) === J([[OK, '_blank', 'noopener,noreferrer'], ['http://127.0.0.1:3999/?popout=chat:', 'wpPopout_chat', 'width=440,height=760'], [OK, null, null], [OK, '_blank', 'noopener,noreferrer']]) && !P.asking()
                && /function wireLinks\(win, doc, ask\) \{\n\s*openGuard\(win\);/.test(gateSrc), P.opened);
        }
        {   // the question is answered only by a deliberate press of its button
            const P = mkPage({ net: PLAYER }), a = P.link('docReaderBody', OK), st = () => [P.asking(), P.opened.length]; P.click(a);
            const dim = [P.ccOk.disabled, P.timers.length, P.timers[0] && P.timers[0].ms, P.timers[0] && P.timers[0].on];
            P.press({ detail: 2 }); const dbl = st();                                         // the second click of a double-click, landing where OK appeared
            P.clock.t += 50; P.press({ detail: 1 }); const soon = st();                       // a single click 50 ms after the question came up
            P.clock.t += 600; P.press({ detail: 1 }); const at650 = st();
            P.clock.t += 50; P.press({ detail: 2 }); P.press({ detail: 3 }); const lateDbl = st();   // a multi-click is never an answer
            P.press(); P.press(null); P.press({}); const noEvent = st();                         // nor a call that is no click at all
            P.clock.t -= 5000; P.press({ detail: 1 }); const back = st(); P.clock.t += 5000;   // nor one when the clock has gone back
            if (P.timers[0]) P.timers[0].fn(); const ready = P.ccOk.disabled;                                   // the moment has passed: the button is shown ready
            P.press({ detail: 1 }); const yes = [P.asking(), J(P.opened)];
            P.click(a); P.clock.t += 700; P.press({ detail: 0 }); const kb = st();             // the button pressed from the keyboard, once the question has been up
            P.click(a); P.clock.t += 699; P.press({ detail: 1 }); const edge = st(), tOn = () => !!(P.timers[2] && P.timers[2].on), dim2 = [P.ccOk.disabled, P.timers.length, tOn()]; P.no(); const gone = [P.ccOk.disabled, tOn()];
            let plain = null; P.showConfirm('Delete?', v => { plain = v; }); P.press({ detail: 2 }); const plainDone = [P.asking(), plain];
            let ne = null; P.showConfirm('Start?', v => { ne = v; }, { noEnter: true }); const neDim = [P.ccOk.disabled, P.timers.length]; P.press(); const neDone = [P.asking(), ne];
            check('links (the question is read before it is answered, dialogs.js run for real on an injected clock): the OK of the link question does nothing for a click that is part of a double-click or comes within 700 ms of the question appearing — the question stays up and nothing opens — nor for a call that is no click; a single press after that opens the cleaned address once, a press from the keyboard too; until then the button is shown as not ready, and a question answered sooner leaves it ready and its timer stopped; an ordinary question, and one only marked noEnter, are answered at once as ever and never dim the button',
                J([dbl, soon, at650, lateDbl, noEvent, back]) === J([[true, 0], [true, 0], [true, 0], [true, 0], [true, 0], [true, 0]]) && J(yes) === J([false, J([[OK, '_blank', 'noopener,noreferrer']])]) && J(kb) === J([false, 2]) && J(edge) === J([true, 2])
                && J(plainDone) === J([false, true]) && J(neDone) === J([false, true]) && J(dim) === J([true, 1, 700, true]) && ready === false && J(dim2) === J([true, 3, true]) && J(gone) === J([false, false]) && J(neDim) === J([false, 3]), [dbl, soon, at650, lateDbl, noEvent, back, yes, kb, edge, plainDone, neDone, dim, ready, dim2, gone, neDim]);
        }
        {   // a notice that arrives while a question is up waits its turn, and takes nothing from the question
            const P = mkPage({ net: PLAYER }), a = P.link('docReaderBody', OK), got = []; P.click(a);
            P.dlg.showAlert('The floor gives way.', v => got.push(v));
            const during = [P.asking(), P.ccTitle.textContent, P.ccNo.style.display === 'none', !!P.body(), got.length];
            P.no(); const then = [P.asking(), P.ccTitle.textContent, P.ccNo.style.display, !!P.body(), P.opened.length, got.length];
            P.key('Enter'); const after = [P.asking(), P.ccNo.style.display === 'none', J(got)];
            const Q = mkPage({ net: ALONE }); let q2 = null; Q.dlg.showAlert('one'); const alone = [Q.asking(), Q.ccTitle.textContent, Q.ccNo.style.display];
            Q.showConfirm('two?', v => { q2 = v; }); const queued = [Q.ccTitle.textContent, Q.ccNo.style.display];
            Q.press(); const next = [Q.asking(), Q.ccTitle.textContent, Q.ccNo.style.display === 'none']; Q.key('Escape'); const end = [Q.asking(), q2, Q.ccNo.style.display === 'none'];
            check('links (a notice while the question is up, dialogs.js showAlert run for real): a one-button notice that arrives while a question is up waits its turn — the question keeps its Cancel button, its words and its body; the notice shows only once the question is answered, and only then is Cancel put away, and back again when the notice closes; a question waiting behind a notice gets its Cancel',
                J(during) === J([true, ASK, false, true, 0]) && J(then) === J([true, 'The floor gives way.', 'none', false, 0, 0]) && J(after) === J([false, false, '[true]'])
                && J(alone) === J([true, 'one', 'none']) && J(queued) === J(['one', 'none']) && J(next) === J([true, 'two?', false]) && J(end) === J([false, false, false]), [during, then, after, alone, queued, next, end]);
        }
        {   // a drag that begins on a link
            const drag = (net, zone, o) => { o = o || {}; const Q = mkPage(net === undefined ? {} : { net }); Object.assign(Q.z.handoutModal.dataset, o.data || {}); const where = zone === 'editing' ? Q.z.editingIn : zone;
                const a = o.svg ? svgLink(Q, where, 'href' in o ? o.href : OK).a : Q.link(where, o.bare ? undefined : 'href' in o ? o.href : OK), t = o.div ? Q.z[zone] : o.text ? a.firstChild : a, e = Q.dom.fire(t, 'dragstart'); return e.defaultPrevented && !Q.asking() && !Q.opened.length ? 'stopped' : !e.defaultPrevented && !Q.asking() && !Q.opened.length ? 'free' : 'odd'; };
            const got = { handoutGm: drag(ALONE, 'handoutModal', { data: { linksGm: '1' } }), handoutShare: drag(GM, 'handoutModal', { data: { linksWho: 'Pat' } }), handoutOwn: drag(PLAYER, 'handoutModal', { data: { linksOwn: '1' } }), pagePlayer: drag(PLAYER, 'docReaderBody'), pagePlayerText: drag(PLAYER, 'docReaderBody', { text: true }), panelPlayer: drag(PLAYER, 'docPanelBody'), diagramPlayer: drag(PLAYER, 'docReaderBody', { svg: true }),
                popPlayer: drag(undefined, 'popoutBody'), elsewhere: drag(GM, 'whiteboard'), chat: drag(ALONE, 'chatLog'), editing: drag(ALONE, 'editing'), badOwn: drag(ALONE, 'plannerPreview', { href: '/api/data' }), badDiagram: drag(GM, 'plannerPreview', { svg: true, href: 'mailto:a@b.example' }),
                gmPreview: drag(GM, 'plannerPreview'), aloneReader: drag(ALONE, 'docReaderBody', { text: true }), gmDiagram: drag(GM, 'plannerPreview', { svg: true }), help: drag(PLAYER, 'helpModal'), noAddress: drag(PLAYER, 'docReaderBody', { bare: true }), noLink: drag(PLAYER, 'docReaderBody', { div: true }) };
            check('links (a drag): a link is dragged only where a click on it opens it directly — in a handout or a share you received, on a page on a player\'s screen (its text and a diagram\'s link too), in a pop-out that cannot tell, anywhere the rule does not name, in a box that is being edited, and for an address the link rule does not keep, the drag does not begin, so the address cannot be dropped on another of the app\'s windows and followed there unasked; in your own preview and reader, the app\'s own words and your own handout a link drags as ever; what is not a link is left alone; a drag asks nothing and opens nothing',
                J(got) === J({ handoutGm: 'stopped', handoutShare: 'stopped', handoutOwn: 'free', pagePlayer: 'stopped', pagePlayerText: 'stopped', panelPlayer: 'stopped', diagramPlayer: 'stopped', popPlayer: 'stopped', elsewhere: 'stopped', chat: 'stopped', editing: 'stopped', badOwn: 'stopped', badDiagram: 'stopped',
                    gmPreview: 'free', aloneReader: 'free', gmDiagram: 'free', help: 'free', noAddress: 'free', noLink: 'free' }), got);
        }
        {   // the three lists of places, and the page as it is nested
            const ixZ = fs.readFileSync(path.join(dir, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
            const Z = mkPage({ net: PLAYER }), mk = (id, parent) => { const e = Z.doc.createElement('div'); e.id = id; parent.appendChild(e); return e; };
            const readerModal = mk('docReaderModal', Z.doc.body); readerModal.appendChild(Z.z.docReaderBody); const hText = mk('handoutText', Z.z.handoutModal), journal = mk('journalModal', Z.doc.body), jList = mk('journalList', journal);
            const inReader = Z.link(Z.z.docReaderBody, OK), inHandout = Z.link(hText, OK), inJournal = Z.link(jList, OK), W = Z.W;
            const zones = [Z.api.linkWhere(inReader, W).zone, Z.api.linkWhere(inHandout, W).zone, Z.api.linkWhere(inJournal, W).zone, Z.api.linkWhere(Z.link('helpModal', OK), W).zone, Z.api.linkWhere(Z.link('aboutModal', OK), W).zone, Z.api.linkWhere(Z.link('settingsModal', OK), W).zone, Z.api.linkWhere(Z.link('plannerPreview', OK), W).zone, Z.api.linkWhere(Z.link('docPanelBody', OK), W).zone, Z.api.linkWhere(Z.link('popoutBody', OK), W).zone];
            Z.click(inReader); const readerAsks = Z.asking() && Z.opened.length === 0 ? Z.lines()[0][1] : 'opened'; Z.no(); Z.click(inJournal); const journalAsks = Z.asking() && Z.opened.length === 0; Z.no();
            check('links (the places, pinned and run on a page nested as the app\'s own): the handout viewer is #handoutModal alone, the app\'s own words are Help, About and Settings alone, and a planner or a page is read in the preview, the reader\'s body, the panel\'s body and the pop-out\'s body alone; the reader\'s body lies inside the reader\'s window and the handout\'s text inside the viewer, as in the page itself, and a link there is a page\'s and the viewer\'s — on a player\'s screen the reader asks; a window the lists do not name (the Journal\'s list) is nobody\'s place and asks',
                /\nvar ZONE_VIEWER = '#handoutModal';/.test(gateSrc) && /\nvar ZONE_APP = '#helpModal, #aboutModal, #settingsModal';/.test(gateSrc) && /\nvar ZONE_PAGE = '#plannerPreview, #docReaderBody, #docPanelBody, #popoutBody';/.test(gateSrc)
                && J(zones) === J(['page', 'viewer', 'other', 'app', 'app', 'app', 'page', 'page', 'page']) && readerAsks === 'It came from the GM.' && journalAsks
                && /<div id="docReaderModal"[^>]*>[\s\S]{0,600}?<div id="docReaderBody"/.test(ixZ) && /<div id="handoutModal"[^>]*>[\s\S]{0,1600}?<div id="handoutText"[\s\S]{0,600}?<div id="handoutCaption"/.test(ixZ) && ['helpModal', 'aboutModal', 'settingsModal', 'plannerPreview', 'docPanelBody'].every(id => ixZ.split('id="' + id + '"').length === 2), [zones, readerAsks, journalAsks]);
        }
        {   // a diagram block in a planner's preview: judged as the diagram library will read it
            const dec = h => h.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');   // the pre's markup with its character references read once, as the diagram library reads it
            const pre = (blk) => { const h = plannerPreviewHtml({ blocks: [blk] }, { id: 'c1', items: {} }), m = /<pre class="mermaid">([\s\S]*?)<\/pre>/.exec(h); return m ? m[1] : null; };
            const directive = t => t.split('\n').some(l => !DR.readLinkLine(l) && l.split(';').some(s => /^\s*(click|callback|href|link|links)\b/i.test(s)));   // (a whole canonical line — click <id> href "<address>", which the strip itself writes — is no directive left over)
            const HID = ['graph TD\nQ[x]-->R\n&#99;lick Q call f("1")', 'graph TD\nQ[x]-->R\n&#x63;lick Q href "https://a.example/"', 'graph TD\nQ[x]-->R&#59; click Q call f()', 'graph TD\nQ[x]-->R&#10;click Q call f()', 'graph TD\nQ[x]-->R\ncl<x>ick Q call f()', 'graph TD\nQ[x]-->R\ncl<!-- -->ick Q "https://a.example/"',
                'graph TD\nQ[x]-->R\n&#99;allback Q "f"', 'graph TD\nQ[x]-->R\n&amp;#99;lick Q call f()\n&#99;lick Q call f()', 'classDiagram\nclass Q[x]\n&#108;ink Q "https://a.example/"', 'graph TD; Q[x]-->R; click Q call f()', 'graph TD\nQ[x]-->R\nclick Q call f()'];
            const outs = HID.map(src => pre({ type: 'diagram', content: src })), bad = outs.map((o, i) => o === null || directive(dec(o)) || dec(o).indexOf('Q[x]') < 0 ? i : -1).filter(i => i >= 0);
            const HON = 'graph TD\nA[one<br>two] --> B{"a &amp; b"}\nB -->|x &lt; y| C\nC --> D["say #quot;click#quot; #35;1"]', honest = pre({ type: 'diagram', content: HON });
            const lab = 'Wait; click the lever "now"; link it "up"', fcPre = pre({ type: 'flowchart', nodes: [{ id: 'a', text: lab }], edges: [{ from: 'a', to: 'a', text: 'go; callback x' }] });
            check('planner preview (a diagram block, run for real): the block is judged as the diagram library will read it — a directive written with character references, split by a tag or a comment, or put after a ; reaches the library in no spelling (the rest of the diagram stays); a diagram that hides none is handed over byte for byte as before (a typed <br>, an &amp; and an &lt; read as they did); a flowchart made in the builder keeps a label that says "; click …" whole',
                bad.length === 0 && honest === DR.sanitizeHtml(HON) && fcPre !== null && dec(fcPre).indexOf('a["Wait; click the lever #quot;now#quot;; link it #quot;up#quot;"]') > 0 && dec(fcPre).indexOf('a -->|"go; callback x"| a') > 0, [bad, bad.map(i => outs[i]), honest, fcPre]);
            const linkPre = pre({ type: 'flowchart', nodes: [{ id: 'a', text: 'A', link: 'https://a.example/x?y=1&z=2' }, { id: 'b', text: 'B', link: 'javascript:alert(1)' }], edges: [{ from: 'a', to: 'b', text: 'e', link: 'https://a.example/' }] });
            check('planner preview (a diagram\'s link, run for real): a link statement hidden behind a character reference, a comment or a class diagram\'s own form reaches the library only as the one canonical line the strip writes — click <id> href "<address>" — with the rest of the diagram as it was; a built flowchart hands over that line for a linked node, none for a script address and none for an arrow',
                dec(outs[1]) === 'graph TD\nQ[x]-->R\nclick Q href "https://a.example/"' && dec(outs[5]) === 'graph TD\nQ[x]-->R\nclick Q href "https://a.example/"' && dec(outs[8]) === 'classDiagram\nclass Q[x]\nclick Q href "https://a.example/"'
                && linkPre !== null && (dec(linkPre).match(/^click .*$/gm) || []).join('|') === 'click a href "https://a.example/x?y=1&z=2"' && !/javascript/.test(linkPre), [outs[1], outs[5], outs[8], linkPre]);
        {   // a diagram's link (1.5.0): the drawn link's title and target (planner.js sliced by its diagramlinks markers), the click on it, the look, the library's own reading
            const XLK = 'http://www.w3.org/1999/xlink', fcSrc = slice('planner.js', 'diagramlinks'), HOST = 'https://ok.example/?q=<script>alert(1)</script>&x="\'';   // an address the link rule keeps: only ever an attribute's value and a title's text
            const chart = (P, zone) => { const dg = P.doc.createElement('div'), svg = P.doc.createElement('svg'); dg.className = 'diagram'; dg.appendChild(svg); P.z[zone].appendChild(dg); return svg; };
            const shape = (P, svg, set) => { const a = P.doc.createElement('a'), g = P.doc.createElement('g'), lab = P.doc.createElement('span'); set(a); g.className = 'node default clickable'; lab.appendChild(P.doc.createTextNode('The vault')); g.appendChild(lab); a.appendChild(g); svg.appendChild(a); return { a, g, lab }; };
            const passOf = P => new Function('document', 'TF', fcSrc + '\nreturn fcLinks;')(P.doc, TFl);
            const titles = a => a.childNodes.filter(c => c.nodeType === 1 && c.nodeName === 'TITLE');
            const P = mkPage({ net: PLAYER }), svg = chart(P, 'docReaderBody');
            const good = shape(P, svg, a => { a.setAttributeNS(XLK, 'xlink:href', OK); a.setAttribute('target', '_top'); const old = P.doc.createElement('title'); old.appendChild(P.doc.createTextNode('javascript:alert(1)')); a.appendChild(old); });
            const mark = shape(P, svg, a => { a.setAttribute('xlink:href', HOST); a.setAttribute('target', '_self'); });
            const js = shape(P, svg, a => { a.setAttributeNS(XLK, 'xlink:href', 'javascript:alert(1)'); }), rel = shape(P, svg, a => { a.setAttribute('href', '/saves/data.json'); a.setAttribute('target', '_blank'); }), sp = shape(P, svg, a => { a.setAttributeNS(XLK, 'xlink:href', ' ' + OK + ' '); }), bare = shape(P, svg, a => {});
            const prose = P.link('docReaderBody', OK, { target: '_blank', rel: 'noopener noreferrer' });   // a text block's link, outside any diagram: not this pass's
            const ran = throwsNot(() => passOf(P)(P.z.docReaderBody)), again = throwsNot(() => passOf(P)(P.z.docReaderBody));
            const tG = titles(good.a), tM = titles(mark.a);
            const titled = [ran && again, tG.length, good.a.firstChild === tG[0], tG[0] && tG[0].childNodes.length === 1 && tG[0].firstChild.nodeType === 3 && tG[0].firstChild.nodeValue, good.a.hasAttribute('target'), tM.length === 1 && tM[0].firstChild.nodeType === 3 && tM[0].firstChild.nodeValue === HOST && !mark.a.hasAttribute('target') && tM[0].all().length === 0];
            const dead = [js, rel, sp].map(x => !x.a.hasAttribute('href') && !x.a.hasAttribute('xlink:href') && !x.a.hasAttributeNS(XLK, 'href') && !x.a.hasAttribute('target') && titles(x.a).length === 0 && x.g.parentNode === x.a), untouched = titles(bare.a).length === 0 && bare.a.childNodes.length === 1 && prose.getAttribute('target') === '_blank' && prose.getAttribute('href') === OK && titles(prose).length === 0;
            const e1 = P.click(good.lab), asked = P.asking() && J(P.lines()), eJ = [P.click(js.lab), P.mid(rel.lab), P.click(sp.lab)]; P.no(); const afterNo = [P.asking(), P.opened.length];
            const own = mkPage({ net: ALONE }), svgO = chart(own, 'plannerPreview'), mine = shape(own, svgO, a => { a.setAttributeNS(XLK, 'xlink:href', OK); a.setAttribute('target', '_self'); }); passOf(own)(own.z.plannerPreview); const eO = own.click(mine.lab);
            check('a diagram\'s link (the drawn link, planner.js fcLinks run for real on a page that refuses markup): wherever a diagram is drawn a linked shape\'s <a> keeps only an address the link rule keeps — a script address, a local one and one that is not exactly the cleaned address lose it and are no link — and never a target (the library\'s own would steer the app\'s window); it says where it leads in ONE <title>, its first child, whose only child is a text node holding the cleaned address (markup characters in an address are text; a title that was there is replaced); run twice it is the same; an <a> with no address and a link outside a diagram are left as they were. A click on it is the gate\'s: on a player\'s screen it asks, with the site and the whole address; on your own it opens the cleaned address once, in a new window',
                J(titled) === J([true, 1, true, OK, false, true]) && dead.every(Boolean) && untouched && e1.defaultPrevented && asked === J([['linkask-from', 'It came from the GM.'], ['linkask-label', 'It leads to the site'], ['linkask-site', 'ok.example'], ['linkask-label', 'The whole address'], ['linkask-url', OK]]) && J(afterNo) === J([false, 0])
                && eO.defaultPrevented && J(own.opened) === J([[OK, '_blank', 'noopener,noreferrer']]) && !own.asking() && !/innerHTML|outerHTML|insertAdjacentHTML|setAttribute\('on/.test(fcSrc) && /t\.textContent = link;/.test(fcSrc), [titled, dead, untouched, asked, afterNo, own.opened]);

            // the end of a drag or a resize: the app's mark on the link, and the gate opens nothing for it
            const heldRes = [];
            [ALONE, GM, PLAYER, undefined].forEach(net => ['plannerPreview', 'docReaderBody', 'docPanelBody', 'popoutBody'].forEach(z => { const Q = mkPage(net === undefined ? {} : { net }), s = chart(Q, z), x = shape(Q, s, a => { a.setAttributeNS(XLK, 'xlink:href', OK); a.setAttribute('data-held', '1'); });
                const ev = [Q.click(x.lab), Q.mid(x.lab), Q.click(x.lab, { ctrlKey: true }), Q.dom.fire(x.a, 'dragstart')]; heldRes.push(ev.every(e => e.defaultPrevented) && !Q.asking() && Q.opened.length === 0); }));
            const H = mkPage({ net: ALONE }), sH = chart(H, 'plannerPreview'), xH = shape(H, sH, a => { a.setAttributeNS(XLK, 'xlink:href', OK); a.setAttribute('data-held', '1'); }); H.click(xH.lab); const n0 = H.opened.length; xH.a.removeAttribute('data-held'); const eA = H.click(xH.lab), dA = H.dom.fire(xH.a, 'dragstart');
            const HP = mkPage({ net: PLAYER }), sP = chart(HP, 'docReaderBody'), xP = shape(HP, sP, a => { a.setAttributeNS(XLK, 'xlink:href', OK); a.setAttribute('data-held', '1'); }); HP.click(xP.lab); const p0 = HP.asking(); xP.a.removeAttribute('data-held'); HP.click(xP.lab); const p1 = HP.asking(); HP.no();
            check('a diagram\'s link (the end of a drag or a resize): a link that carries the app\'s mark (data-held — planner.js sets it on a linked node while the click that ends a drag or a resize is on its way) opens nothing and asks nothing, for a click, a middle click and Ctrl+click, in every place and role, the engine\'s own following stopped and no drag begun; with the mark off the same click opens it (your own) or asks (a player\'s screen); the rule itself: held gives nothing in every place',
                heldRes.length === 16 && heldRes.every(Boolean) && n0 === 0 && eA.defaultPrevented && J(H.opened) === J([[OK, '_blank', 'noopener,noreferrer']]) && !dA.defaultPrevented && p0 === false && p1 === true && HP.opened.length === 0
                && ['viewer', 'app', 'page', 'other'].every(z => G0.linkVerdict({ link: OK, editing: false, held: true, zone: z, own: true, player: false }) === 'none' && G0.linkVerdict({ link: OK, editing: false, held: false, zone: z, own: true, player: false }) === (z === 'other' ? 'ask' : 'open')), [heldRes.filter(x => !x).length, n0, H.opened, p0, p1]);

            // the look, and where the pass runs
            const css = fs.readFileSync(path.join(dir, '..', 'style.css'), 'utf8').replace(/\r\n/g, '\n'), plAll = read('planner.js'), hbAll = read('handbook.js'), bin = f => fs.readFileSync(path.join(dir, f), 'latin1');
            check('a diagram\'s link (the look, and every place a diagram is drawn): a linked shape reads as a link by the page\'s own style — the pointer and its label underlined, on :any-link, so a shape whose address was taken off shows neither — with no class and no style written into the drawing; the pass that gives it its title and takes its target runs after the diagram library in the planner\'s preview (fcPostProcess) and, through wpFcPostProcess, in the reader and a sheet\'s handbook page (handbook.js), the floating panel and a pop-out — over every diagram drawn there, a hand-written one too',
                /\n  \.diagram svg a:any-link, \.diagram svg a:any-link g\.node \{ cursor: pointer !important; \}\n  \.diagram svg a:any-link \.nodeLabel, \.diagram svg a:any-link text \{ text-decoration: underline; \}\n/.test(css)
                && /function fcPostProcess\(\) \{\n\s*fcLinks\(document\.getElementById\('plannerPreview'\)\);/.test(plAll) && /window\.wpFcPostProcess = function\(root, doc\) \{\n\s*fcLinks\(root\);/.test(plAll) && /mermaid\.run\(\{ querySelector: '#plannerPreview \.mermaid' \}\)\)\.then\(fcPostProcess\)/.test(plAll)
                && /mermaid\.run\(\{ nodes: nodes \}\)\)\.then\(function\(\) \{ if \(window\.wpFcPostProcess\) window\.wpFcPostProcess\(body, it\); \}\)/.test(hbAll) && ['docpanel.js', 'popout.js'].every(f => /\.then\(function\(\) \{ if \(window\.wpFcPostProcess\) window\.wpFcPostProcess\(body, it\);/.test(bin(f)))
                && /root\.querySelectorAll\('\.diagram svg a'\)/.test(fcSrc) && !/classList|className|\.style\b/.test(fcSrc));

            // the diagram library's own reading, pinned against the bundled file: what the link rule and the strip are built on
            const lib = fs.readFileSync(path.join(dir, '..', 'assets', 'vendor', 'mermaid.min.js'), 'utf8'), drAll = read('docrender.js'), hasL = s => lib.indexOf(s) >= 0;
            const PAT = {
                'an address it cleans (sanitizeUrl): the characters it drops, the codes it decodes': String.raw`u=/&#(\w+)(^\w|;)?/g,d=/&(newline|tab);/gi,p=/[\u0000-\u001F\u007F-\u009F\u2000-\u200D\uFEFF]/gim`,
                'the schemes it refuses': String.raw`a=/^([^\w]*)(javascript|data|vbscript)/im`,
                'its #…; codes, and the ; it takes off a style line': String.raw`a=a.replace(/style.*:\S*#.*;/g,function(u){return u.substring(0,u.length-1)}),a=a.replace(/classDef.*:\S*#.*;/g,function(u){return u.substring(0,u.length-1)}),a=a.replace(/#\w+;/g,`,
                'its placeholders, read back in the drawing': String.raw`i.replace(/ﬂ°°/g,"&#").replace(/ﬂ°/g,"&").replace(/¶ß/g,";")`,
                'its blocks, front matter and comments (what it takes out before it reads)': String.raw`tje=/^-{3}\s*[\n\r](.*?)[\n\r]-{3}\s*[\n\r]+/s,tR=/%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi,wBt=/\s*%%.*\n/gm`,
                'its comment lines': String.raw`i.replace(/^\s*%%(?!{)[^\n]+\n?/gm,"").trimStart()`,
                'the tags it rewrites': String.raw`.replace(/<(\w+)([^>]*)>/g,`,
                'a flowchart\'s click statement: the id is any run with no space, href is its own word': String.raw`/^(?:href[\s])/,/^(?:click[\s]+)/,/^(?:[\s\n])/,/^(?:[^\s\n]*)/`,
                'a link\'s address goes through its cleaner in every mode but loose': String.raw`a.securityLevel!=="loose"?b9.sanitizeUrl(u):u`,
                'a function is called only in loose mode (a flowchart\'s, a class diagram\'s)': String.raw`if(qt().securityLevel!=="loose"||a===void 0)return`,
                'a linked node is drawn inside an <a> whose address is in xlink:href': String.raw`i.insert("svg:a").attr("xlink:href",a.link).attr("target",v)`,
                'a Gantt chart\'s link steers the window itself': String.raw`window.open(u,"_self")`
            };
            const missing = Object.keys(PAT).filter(k => !hasL(PAT[k]));
            check('a diagram\'s link (the diagram library\'s own reading, pinned against the bundled file): the patterns the one rule is built on are the library\'s own, as bundled — the address cleaner it runs in strict mode (what it drops and decodes), its #…; codes and placeholders, its %%{…}%% blocks, front matter and comments, the tags it rewrites, how it reads a click statement, that a function is called only in loose mode, that a linked node is an <a xlink:href>, and that a Gantt chart\'s link would steer the window (the strip writes none there); docrender.js carries the library\'s block and comment patterns character for character',
                missing.length === 0 && drAll.indexOf(String.raw`var MM_BLOCK = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;`) > 0 && drAll.indexOf(String.raw`var MM_COMMENT = /^\s*%%(?!{)[^\n]+\n?/gm;`) > 0
                && (drAll.match(/^var MM_LINK_NO = .*$/m) || [''])[0].length > 60 && DR.diagramLink('https://ok.example/#a;b') === '' && DR.diagramLink('https://ok.example/a;b#c') === 'https://ok.example/a;b#c' && (lib.match(/window\.open\(/g) || []).length >= 1, missing);
        }

        }

        // the renderer: a plain text drawn with its addresses as links
        {
            const dom = makeDom(), doc = dom.document, el = doc.createElement('div'), T2 = '<img src=x onerror=alert(1)> see ' + OK + ', then javascript:alert(1) and <a href="https://evil.example/x" onclick="alert(2)">x</a>\nline two (https://b.example/a_(b)). www.c.example \u0430 https://\u0430\u0440\u0440\u04cf\u0435.example/';
            const drew = throwsNot(() => G0.fillLinked(el, T2, doc)), kids = el.childNodes.slice(), as = kids.filter(n => n.nodeType === 1);
            const okA = a => a.nodeName === 'A' && J(Object.keys(a.attrs)) === J(['href', 'target', 'rel']) && a.attrs.target === '_blank' && a.attrs.rel === 'noopener noreferrer' && TFl.cleanLink(a.attrs.href) === a.attrs.href && a.childNodes.length === 1 && a.firstChild.nodeType === 3 && a.firstChild.nodeValue === a.attrs.href && !a.className && !a.id && !Object.keys(a.dataset).length && !Object.keys(a.style).length && !Object.keys(a.handlers).length;
            G0.fillLinked(el, 'second ' + OK, doc); const second = el.childNodes.map(n => n.textContent);
            G0.fillLinked(el, '', doc); const empty = el.childNodes.length; G0.fillLinked(el, null, doc);
            check('links (the renderer, on a page that throws on markup): a plain text is drawn as text nodes and, around each web address, an <a> the app makes — its href the cleaned address, the sanitiser\'s target and rel, its text the address itself and nothing else; markup in the text is its characters, a script address is text, a line break stays in its text node; drawn again it holds only the new text',
                drew && kids.every(n => n.nodeType === 3 || okA(n)) && kids.map(n => n.textContent).join('') === T2 && J(as.map(a => a.attrs.href)) === J([OK, 'https://evil.example/x', 'https://b.example/a_(b)', 'https://\u0430\u0440\u0440\u04cf\u0435.example/']) && kids.some(n => n.nodeType === 3 && n.nodeValue.indexOf('\n') >= 0)
                && J(second) === J(['second ', OK]) && empty === 0 && el.childNodes.length === 0, [drew, as.map(a => a.attrs.href)]);
        }

        // the handout viewer (handouts.js showHandout, run for real) and the gate on the same page
        {
            const viewerSrc = slice('handouts.js', 'viewer');
            const mkViewer = (o) => {
                const P = mkPage(o || { net: ALONE }), doc = P.doc, m = P.z.handoutModal, ids = {};
                ['handoutTitle', 'handoutImg', 'handoutText', 'handoutCaption', 'handoutFresh', 'handoutNotesWrap', 'handoutNotes'].forEach(id => { const e = doc.createElement(id === 'handoutImg' ? 'img' : 'div'); e.id = id; m.appendChild(e); ids[id] = e; });
                ids.handoutModal = m;
                const wnd = { wpStream: !!(o && o.stream) };
                P.show = new Function('ui', 'picRef', 'fillLinked', 'readIndex', 'window', 'document', viewerSrc + '\nreturn showHandout;')(id => ids[id] || null, SC.picRef, P.api.fillLinked, async () => ({ entries: [] }), wnd, doc);
                P.ids = ids;
                return P;
            };
            const TXT = 'Dear ' + T + ',\nmeet at ' + OK + ' or javascript:alert(1).\n<a href="' + U + '">x</a>', CAP = P + ' see https://cap.example/x.', TTL = T + ' https://title.example/';
            const VW = mkViewer(), drew = throwsNot(() => VW.show({ title: TTL, text: TXT, caption: CAP, from: { who: T } })), tx = VW.ids.handoutText, cp = VW.ids.handoutCaption, ti = VW.ids.handoutTitle;
            const shape = el => el.childNodes.map(n => n.nodeType === 3 ? 't' : n.nodeName + ':' + n.attrs.href + ':' + n.textContent).join('|');
            const tAs = tx.all(), cAs = cp.all();
            check('journal (the handout viewer, run for real): a hostile title, text and caption reach the viewer as text nodes and, around each web address in the text and the caption, an <a> whose href is the cleaned address and whose text is that address — no other element, no markup, no picture from a web address; the title stays plain text (an address in it is no link); line breaks are in the text',
                drew && tx.textContent === TXT && cp.textContent === CAP && ti.textContent === TTL && ti.all().length === 0 && J(tAs.map(a => [a.nodeName, a.attrs.href, a.textContent, Object.keys(a.attrs).join()])) === J([['A', OK, OK, 'href,target,rel'], ['A', U, U, 'href,target,rel']]) && J(cAs.map(a => [a.nodeName, a.attrs.href, a.textContent])) === J([['A', 'https://cap.example/x', 'https://cap.example/x']])
                && tx.childNodes.every(n => n.nodeType === 3 || n.nodeName === 'A') && VW.ids.handoutImg.attrs.src === undefined && tx.style.display === 'block' && cp.style.display === 'block', [drew, shape(tx), shape(cp)]);
            const data = f => { const V2 = mkViewer(); V2.show({ title: 't', text: 'x', from: f }); const d = V2.z.handoutModal.dataset; return [d.linksOwn, d.linksGm, d.linksWho]; };
            check('journal (the handout viewer): it is told whose the shown thing is and keeps that on itself for the links in it — yours only for exactly own: true; else the GM, or a player by a name cut to 60; anything else (nothing, a text, an odd value) is nobody\'s, which asks',
                J(data({ own: true })) === J(['1', '', '']) && J(data({ own: true, gm: true, who: 'x' })) === J(['1', '', '']) && J(data({ gm: true, who: 'x' })) === J(['', '1', '']) && J(data({ who: 'w'.repeat(99) })) === J(['', '', 'w'.repeat(60)]) && J(data({ who: 7 })) === J(['', '', ''])
                && [undefined, null, 'own', 7, {}, { own: 'true' }, { own: 1 }, { gm: 'yes' }, []].every(f => J(data(f)) === J(['', '', ''])), [data({ own: true }), data({ gm: true, who: 'x' }), data(null)]);
            // the viewer and the gate together
            const openIt = (net, from, text) => { const V3 = mkViewer({ net }); V3.show({ title: 't', text: text || ('go ' + OK), caption: '', from }); const a = V3.ids.handoutText.all()[0]; V3.click(a); return V3.opened.length ? 'open' : V3.asking() ? V3.lines()[0][1] : 'nothing'; };
            const ends = { noteAlone: openIt(ALONE, { own: true }), notePlayer: openIt(PLAYER, { own: true }), previewGm: openIt(GM, { own: true }), gmHandoutPlayer: openIt(PLAYER, { gm: true }), gmHandoutLater: openIt(ALONE, { gm: true }), shareOnGm: openIt(GM, { who: 'Pat' }), shareLater: openIt(ALONE, { who: 'Pat' }), unknown: openIt(ALONE, null), unknownGm: openIt(GM, undefined) };
            check('journal (the viewer and the click together): a note of your own and your own handout\'s preview open directly — a player\'s own note too, at a table; a handout from the GM asks, during the session and later with none; a player\'s share asks on the GM\'s machine too, and names the player; an entry the Journal cannot place asks without naming anyone',
                J(ends) === J({ noteAlone: 'open', notePlayer: 'open', previewGm: 'open', gmHandoutPlayer: 'It came from the GM.', gmHandoutLater: 'It came from the GM.', shareOnGm: 'It came from a player: Pat', shareLater: 'It came from a player: Pat', unknown: 'It may have been written by someone else.', unknownGm: 'It may have been written by someone else.' }), ends);
            const SW = mkViewer({ net: { foreign: true }, stream: true }); SW.show({ title: 't', text: 'go ' + OK, caption: OK, from: { own: true } });
            check('journal (the stream window): a handout shown there stays plain text — one text node each, no link (nobody clicks there)',
                SW.ids.handoutText.all().length === 0 && SW.ids.handoutCaption.all().length === 0 && SW.ids.handoutText.textContent === 'go ' + OK && SW.ids.handoutText.childNodes.length === 1 && SW.ids.handoutCaption.childNodes.length === 1);
        }

        // opening a Journal row, and saving the table's notepad (handouts.js, run for real on rows of plain objects)
        {
            const openSrc = slice('handouts.js', 'journalopen'), noteSrc = slice('handouts.js', 'journalnote');
            const shown = [], idx = { c1: { entries: [{ id: 'h1', text: 'stored text ' + OK }] } };
            const openRow = new Function('showHandout', 'readIndex', openSrc + '\nreturn openRow;')(h => shown.push(h), key => ({ then: fn => fn(idx[key] || { entries: [] }) }));
            const row = (data, parts) => { const r = { dataset: data, querySelector: s => parts[s] || null }; return r; };
            const hit = (r, cls, attrs) => ({ closest: s => (s === cls ? { closest: () => r, getAttribute: k => (attrs || {})[k] || null } : null) });
            openRow(hit(row({ kind: 'note', mine: '1', camp: 'c1', id: 'n1' }, { '.journal-note-title': { value: 'My note' }, '.journal-note-body': { value: 'typed just now ' + OK } }), '.journal-open'));
            openRow(hit(row({ kind: 'note', gm: '1', camp: 'c1', id: 'n2' }, { '.journal-note-title': { value: '' }, '.journal-note-body': { value: 'table words' } }), '.journal-open'));
            openRow(hit(row({ kind: 'text', gm: '1', camp: 'c1', id: 'h1', text: 'from the row' }, { '.journal-title': { textContent: 'Letter \u00d7' }, '.journal-caption': { textContent: 'cap' } }), '.journal-thumb'));
            openRow(hit(row({ kind: 'image', who: T, camp: 'c1', id: 'h2' }, { '.journal-title': { textContent: 'Pic' } }), '.journal-thumb', { src: '/saves/images/journal/c1/h2.png' }));
            openRow(hit(row({ kind: 'text', sent: '1', mine: '1', text: 'my handout ' + OK }, { '.journal-title': { textContent: 'Mine' } }), '.journal-thumb'));
            openRow(hit(row({ kind: 'text', sent: '1', who: 'Pat', text: 'passed on' }, { '.journal-title': { textContent: 'Theirs' } }), '.journal-thumb'));
            openRow(hit(row({ kind: 'text', camp: 'c1', id: 'h9' }, { '.journal-title': { textContent: 'Old row' } }), '.journal-thumb'));
            openRow({ closest: () => null });
            check('journal (opening a row, run for real): a note opens to be read with what its boxes hold now and no notes box of its own; a received page opens with the text the index holds; each tells the viewer whose it is as its row says — yours, the GM\'s, a player\'s by name — and a row that says nothing is nobody\'s; a click elsewhere opens nothing',
                shown.length === 7 && J(shown[0]) === J({ title: 'My note', caption: '', src: null, text: 'typed just now ' + OK, from: { own: true } }) && J(shown[1]) === J({ title: 'A note', caption: '', src: null, text: 'table words', from: { gm: true } })
                && J(shown[2]) === J({ title: 'Letter', caption: 'cap', entry: { campId: 'c1', id: 'h1' }, from: { gm: true }, text: 'stored text ' + OK }) && J(shown[3]) === J({ title: 'Pic', caption: '', entry: { campId: 'c1', id: 'h2' }, from: { who: T }, src: '/saves/images/journal/c1/h2.png' })
                && J(shown[4].from) === J({ own: true }) && shown[4].text === 'my handout ' + OK && J(shown[5].from) === J({ who: 'Pat' }) && shown[6].from === null, shown.map(s => s.from));
            const saveAs = async (net) => { const ix = { entries: [] }, wnd = { wpNet: net }; new Function('window', 'ownCampaignKey', 'journalKey', 'withIndex', 'stampHead', 'registerJournal', 'badge', 'unseen', 'toast', 'Date', 'Math', noteSrc + '\nreturn 0;')(wnd, () => ({ key: 'c1__u_me' }), () => 'c1__u_gm', async (k, fn) => { fn(ix); return ix; }, () => {}, async () => {}, () => {}, 0, () => {}, { now: () => 5 }, { random: () => 0.5 }); await wnd.wpJournalAddNote({ campaign: 'C' }, 'Table notes', 'see ' + OK); return ix.entries[0]; };
            const asPlayer = await saveAs({ active: true, role: 'client', foreign: true }), asHost = await saveAs({ active: true, role: 'host', foreign: false }), asNone = await saveAs(undefined), rejoining = await saveAs({ active: false, role: 'client', foreign: true });
            check('journal (the table\'s notepad saved): a player who saves it keeps it as a note of their own that is marked as the table\'s — its words came from the GM, so a link in it asks first; the GM\'s own save and a note saved with no table carry no mark; the text is stored as the plain text it is',
                asPlayer.table === true && rejoining.table === true && !('table' in asHost) && !('table' in asNone) && [asPlayer, asHost, asNone].every(e => e.kind === 'note' && e.text === 'see ' + OK && e.title === 'Table notes') && J(Object.keys(asHost)) === J(['id', 'kind', 'title', 'text', 'receivedAt', 'notes']), [asPlayer, asHost]);
        }

        // wired, and a scan of the new code
        {
            const gateAll = read('linkgate.js'), ix = fs.readFileSync(path.join(dir, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
            check('links (wired, pinned): the listener is one, on the document, in the capture phase, for click and auxclick, added as the module loads in every window (the main one, the stream window and a pop-out are the same page); the question is the app\'s own and never answered by Enter; opening is window.open with no opener; handouts.js draws the viewer\'s text and caption through the one renderer and nowhere else; receiving, a row, a note\'s Open and the GM\'s Preview each tell the viewer whose the thing is',
                /doc\.addEventListener\('click', h, true\);\n\s*doc\.addEventListener\('auxclick', h, true\);/.test(gateSrc) && /if \(typeof window !== 'undefined' && typeof document !== 'undefined'\) wireLinks\(window, document, showConfirm\);/.test(gateAll) && /import \{ showConfirm \} from '\.\/dialogs\.js';/.test(gateAll) && /import \{ cleanLink, linkParts \} from '\.\/textfmt\.js';/.test(gateAll)
                && /\{ noEnter: true, careful: true, body: askBody\(doc, url, c\) \}/.test(gateSrc) && /doc\.addEventListener\('auxclick', h, true\);\n\s*doc\.addEventListener\('dragstart', dragGate\(win\), true\);/.test(gateSrc) && /mk\('linkask-site', url\.site\)/.test(gateSrc) && /mk\('linkask-url', url\.href\)/.test(gateSrc) && /win\.open\(link, '_blank', 'noopener,noreferrer'\)/.test(gateSrc) && (gateSrc.match(/\.open\(/g) || []).length === 1 && /<script type="module" src="scripts\/linkgate\.js"><\/script>/.test(ix)
                && /import \{ fillLinked \} from '\.\/linkgate\.js';/.test(hoAll) && (hoAll.match(/fillLinked\(/g) || []).length === 2 && (hoAll.match(/from: cameFrom\(msg\)/g) || []).length === 2 && /from: atSomeonesTable\(\) \? null : \{ own: true \}/.test(hoAll) && /openRow\(e\.target\);/.test(hoAll)
                && /<button class="tool ghost journal-open" title="[^"<>]*"[^>]*>Open<\/button>/.test(hoAll));
            check('links (a scan of the new code — the gate, the renderer, the viewer, opening a row, the notepad\'s save): no innerHTML, outerHTML, insertAdjacentHTML or document.write; no handler attribute and none set by name; no eval, no Function; every element made by createElement with a fixed name (div, a), every text by createTextNode or textContent',
                [gateSrc, slice('handouts.js', 'viewer'), slice('handouts.js', 'journalopen'), slice('handouts.js', 'journalnote')].every(s => !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|Function\(|setAttribute\('on|\.on[a-z]+ = |javascript:/.test(s))
                && J((gateSrc.match(/createElement\(([^)]*)\)/g) || []).sort()) === J(["createElement('a')", "createElement('div')", "createElement('div')"]) && !/createElement/.test(slice('handouts.js', 'viewer')));
            const cssL = fs.readFileSync(path.join(dir, '..', 'style.css'), 'utf8').replace(/\r\n/g, '\n');
            check('links (a pop-out window): the rule that hides the rest of the page in a pop-out leaves the app\'s own question, so a link that asks there can be answered — the question sits directly under the body (where the rule looks) and hides itself while it is closed',
                /body\.popout-mode > \*:not\(#popoutWrap\):not\(#chatPanel\):not\(#customConfirm\)[^{\n]*\{ display: none !important; \}/.test(cssL) && /\n<div id="customConfirm" style="display:none; position:fixed;[^"]*z-index:100010;/.test(ix) && /p\.style\.display = 'none';/.test(dlgSrc));
            const dq = dlgSrc;
            check('links (the app\'s question, pinned): a question may carry a body — an element the caller built — put between the words and the buttons by appendChild and taken out again with the question; a question without one touches nothing new',
                /var bodyEl = opts && opts\.body && typeof opts\.body === 'object' && opts\.body\.nodeType === 1 \? opts\.body : null, slot = null;/.test(dq) && /slot\.appendChild\(bodyEl\); row\.parentNode\.insertBefore\(slot, row\); row\.parentNode\.classList\.add\('confirm-wide'\);/.test(dq) && /slot\.parentNode\.classList\.remove\('confirm-wide'\); slot\.parentNode\.removeChild\(slot\);/.test(dq) && !/innerHTML/.test(dq));
        }
    }

    /* ---- the Journal window against an index read from disk (handouts.js, sliced by its journal and journalshare markers and run for real on a
       recording page) — the outside audit of 2026-10-01: a journal's index is a file under saves/, and a saves folder can come from anywhere ---- */
    {
        const escLine = (/function esc\(s\)\{[^\n]*\}/.exec(read('inspector.js')) || [''])[0], escApp = escLine ? new Function(escLine + '\nreturn esc;')() : null;   // the page's own esc, as handouts.js imports it
        const hoT = read('handouts.js'), tagLine = (/function tagChips\(tags, cls\) \{[^\n]*/.exec(hoT) || [''])[0], ownSrcFn = (/function ownPicSrc\(src\) \{[\s\S]*?\n\}/.exec(hoT) || [''])[0];
        let jSrc = '', shSrc = ''; try { jSrc = slice('handouts.js', 'journal'); shSrc = slice('handouts.js', 'journalshare'); } catch (e) { jSrc = ''; shSrc = ''; }
        const mkJ = (journals, o) => {
            o = o || {};
            const list = { innerHTML: '' }, w = { list, toasts: [], fetched: [], shared: [], err: '' };
            const ui = id => (id === 'journalModal' ? { style: {} } : id === 'journalList' ? list : null);
            const wnd = { wpNet: Object.assign({ myId: 'u_me', active: false, role: null, roster: {}, shareEntry: p => { w.shared.push(p); return true; } }, o.net || {}) };
            const readIndex = async key => journals.find(x => x.campId === key) || { campId: key, entries: [] };
            const fetchS = async u => { w.fetched.push(String(u)); return { ok: true, arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer }; };
            const names = ['ui', 'listJournals', 'ownCampaignKey', 'sentRecords', 'readIndex', 'withIndex', 'journalPage', 'journalDefaultPage', 'journalShow', 'journalShowDefault', 'chipOpensTo', 'journalFilter', 'badge', 'esc', 'picRef', 'window', 'fetch', 'toast', 'document'];
            const vals = [ui, async () => journals, () => o.own || null, () => o.sent || [], readIndex, async (k, fn) => { const ix = await readIndex(k); fn(ix); return ix; }, {}, () => 'all', {}, () => '', () => '', () => {}, () => {}, escApp, SC.picRef, wnd, fetchS, t => w.toasts.push(t), { querySelector: () => null }];
            try { w.api = new Function(...names, '"use strict";\n' + tagLine + '\n' + ownSrcFn + '\n' + shSrc + '\n' + jSrc + '\nreturn { openJournal: openJournal, shareEntry: shareEntry, sentLine: sentLine };')(...vals); } catch (e) { w.err = String(e && e.message); w.api = { openJournal: async () => { throw new Error(w.err); }, shareEntry: async () => { throw new Error(w.err); } }; }
            return w;
        };
        const X = '"><img src=x onerror=1>', protoBefore = Object.getOwnPropertyNames(Object.prototype).sort().join();
        const hostile = [{ campId: X, campaign: X, gm: X, gmId: X, sentNotes: { ['sent:' + X + ':0']: X }, entries: [
            { id: X, kind: 'image', title: X, caption: X, text: X, notes: X, src: X, mime: X, tags: [X], sharedBy: X, sharedById: X, sharedNotes: X, from: X, receivedAt: X, sentTo: [{ to: X, name: X, at: X }, { to: 'gm', name: 'GM', at: ['"><i>'] }, null, 'x', 7, { to: 9, name: 9, at: 9 }, { to: { a: 1 }, name: ['"><i>'], at: '12' }] },
            { id: 'n2', kind: 'note', title: X, text: X, sentTo: X },
            { id: 'n3', kind: 'text', title: X, text: X, sharedBy: 'Mal', sharedById: '__proto__', sentTo: { 0: { at: X } } },
            { id: 'n4', kind: 'text', title: 't', text: 'x', sharedBy: 'Con', sharedById: 'constructor' }] }];
        const JH = mkJ(hostile); let threwH = '';
        try { await JH.api.openJournal(); } catch (e) { threwH = String(e && e.message); }
        const htmlH = JH.list.innerHTML, sentIds = (htmlH.match(/journal-sentrow"[^>]*data-id="[^"]*"/g) || []).map(s => /data-id="([^"]*)"/.exec(s)[1]);
        check('journal (an index from disk): every value of a hostile index — the campaign, the GM, each page\'s id, title, caption, text, notes, picture, tags and sender, and the time a page was sent — reaches the Journal\'s markup only as text or as a number: no tag, no attribute of its own, no picture from outside the app; a sent row\'s id ends in a number whatever the index holds for its time (a text, a list), a row that is no row (nothing, a text, a number) and a sent list that is no list are passed over, and the Journal still opens',
            jSrc.length > 400 && !threwH && htmlH.length > 400 && risks(htmlH).length === 0 && !/<img src=x/.test(htmlH) && !/<i>/.test(htmlH) && JSON.stringify(sentIds) === JSON.stringify([12, 9, 0, 0].map(n => 'sent:' + SC.esc(X) + ':' + n)), [threwH || JH.err, risks(htmlH).slice(0, 3), sentIds]);
        check('journal (an index from disk): a sender whose id is a name every object inherits (__proto__, constructor) is counted in a list of its own — nothing is written onto Object.prototype',
            !threwH && Object.getOwnPropertyNames(Object.prototype).sort().join() === protoBefore && ({}).n === undefined && ({}).name === undefined && /data-from="__proto__"/.test(htmlH) && /data-from="constructor"/.test(htmlH), [Object.getOwnPropertyNames(Object.prototype).filter(k => protoBefore.split(',').indexOf(k) < 0)]);
        delete Object.prototype.n; delete Object.prototype.name; delete Object.prototype.id;
        const honest = [{ campId: 'c1__u_gm', campaign: 'The Camp', gm: 'Gina', gmId: 'u_gm', sentNotes: { 'sent:n1:1700000000000': 'my note' }, entries: [{ id: 'n1', kind: 'note', title: 'T', text: 'body', receivedAt: 1700000000000, sentTo: [{ to: 'gm', name: 'GM', at: 1700000000000 }] }, { id: 'h1', kind: 'image', title: 'Pic', src: '/saves/images/journal/c1__u_gm/h1.png', mime: 'image/png', receivedAt: 1700000000001, notes: 'seen' }] }];
        const JO = mkJ(honest); let threwO = ''; try { await JO.api.openJournal(); } catch (e) { threwO = String(e && e.message); }
        const htmlO = JO.list.innerHTML;
        check('journal (an index from disk): an honest index reads as before — the sent row keeps its id (sent:<page>:<time>) so the note written under that send is found, the page\'s picture is the Journal\'s own file, its notes are in its box',
            !threwO && /data-id="sent:n1:1700000000000" data-kind="text" data-sent="1"/.test(htmlO) && /Your notes about this send…">my note<\/textarea>/.test(htmlO) && /<img class="journal-thumb" src="\/saves\/images\/journal\/c1__u_gm\/h1\.png"/.test(htmlO) && />seen<\/textarea>/.test(htmlO) && /Sent to <b>GM<\/b>/.test(htmlO), [threwO, (/data-id="sent:[^"]*"/.exec(htmlO) || [''])[0]]);
        // whose each row's page is (1.5.0: the links in a page opened from the Journal follow it), and a note's Open
        const whoseIdx = [{ campId: 'c1__u_gm', campaign: 'C', gm: 'Gina', gmId: 'u_gm', entries: [
            { id: 'n1', kind: 'note', title: 'Mine', text: 'see https://a.example/', receivedAt: 6 }, { id: 'n2', kind: 'note', title: 'Table notes', text: 'x', receivedAt: 5, table: true }, { id: 'n3', kind: 'note', title: 'odd', text: 'x', receivedAt: 4, table: 'true' },
            { id: 'h1', kind: 'text', title: 'From GM', text: 't', receivedAt: 3 }, { id: 'h2', kind: 'text', title: 'GM shared', text: 't', receivedAt: 2, sharedBy: 'Gina', sharedById: 'u_gm' },
            { id: 'h3', kind: 'text', title: 'From Mal', text: 't', receivedAt: 1, sharedBy: X + 'w'.repeat(80), sharedById: 'u_mal', sentTo: [{ to: 'gm', name: 'GM', at: 7 }] }] }];
        const JW = mkJ(whoseIdx); let threwW = ''; try { await JW.api.openJournal(); } catch (e) { threwW = String(e && e.message); }
        const htmlW = JW.list.innerHTML, whoA = ' data-who="' + SC.esc((X + 'w'.repeat(80)).slice(0, 60)) + '"';
        const JS2 = mkJ([{ campId: 'c9__u_me', campaign: 'Mine', gm: 'Me', gmId: 'u_me', entries: [] }], { sent: [{ hid: 'h9', to: [{ pid: 'u_a', name: 'Ann', at: 5 }], last: 5, kind: 'text', text: 't https://a.example/', title: 'My handout', caption: '', src: '', tags: [] }] });
        try { await JS2.api.openJournal(); } catch (e) { threwW = threwW || String(e && e.message); }
        check('journal (whose a row is): each row says whose its page is, for the links in it once it is opened — a note of your own is yours; the table\'s notepad a player saved (table: exactly true) and everything from the GM are the GM\'s; a player\'s share is that player\'s, by a name escaped and cut to 60, on its sent row too; a handout the GM has shown is the GM\'s own; a note has an Open button and nothing else has',
            !threwW && /data-id="n1" data-kind="note" data-mine="1">/.test(htmlW) && /data-id="n2" data-kind="note" data-gm="1">/.test(htmlW) && /data-id="n3" data-kind="note" data-mine="1">/.test(htmlW) && /data-id="h1" data-kind="text" data-gm="1" data-text="t">/.test(htmlW) && /data-id="h2" data-kind="text" data-gm="1" data-text="t">/.test(htmlW)
            && htmlW.indexOf('data-id="h3" data-kind="text"' + whoA + ' data-text="t">') > 0 && htmlW.indexOf('data-id="sent:h3:7" data-kind="text" data-sent="1"' + whoA + ' data-text="t">') > 0 && (htmlW.match(/class="tool ghost journal-open"/g) || []).length === 3 && risks(htmlW).length === 0
            && /data-id="sent:h9" data-kind="text" data-sent="1" data-mine="1" data-text="t https:\/\/a\.example\/">/.test(JS2.list.innerHTML) && !/journal-open/.test(JS2.list.innerHTML), [threwW, (htmlW.match(/data-id="[^"]*" data-kind="[^"]*"[^>]*>/g) || []).map(s => s.slice(0, 90))]);
        // Send: only the Journal's own picture is ever read and handed to the table
        const shareRun = async src => { const W = mkJ([{ campId: 'c1__u_gm', entries: [{ id: 'h1', kind: 'image', title: 'Pic', src: src, mime: 'image/png', notes: '' }] }], { net: { active: true, role: 'client' } }); try { await W.api.shareEntry('c1__u_gm', 'h1', 'gm', null); } catch (e) { W.err = String(e && e.message); } return W; };
        const badSrc = ['/api/data', '/saves/data.json', '/saves/preferences.json', '/saves/backups/data-2026-10-01-09-00-00.json', '/saves/images/m_abc/x.png', '/saves/images/journal/../data.json', '/saves/images/journal/c1__u_gm/journal.json', '/saves/images/journal/journals.json', '/saves/images/journal/c1__u_gm/../../m/x.png', '/saves/images/journal/c1__u_gm/sub/h.png', '/saves/images/Journal/c1__u_gm/h1.png', 'blob:http://localhost:3000/abc', 'data:text/html;base64,PGI+', 'data:image/svg+xml;base64,PHN2Zz4=', 'https://evil.example/x.png', '', 5, null];
        const goodSrc = ['/saves/images/journal/c1__u_gm/h1.png', '/saves/images/journal/c1__u_gm/h1-v2abc.jpg', '/saves/images/journal/personal/x_1.webp', 'data:image/png;base64,iVBORw0KGgo=', 'data:image/jpeg;base64,/9j/4AAQ'];
        const badRuns = [], goodRuns = []; for (const s of badSrc) badRuns.push(await shareRun(s)); for (const s of goodSrc) goodRuns.push(await shareRun(s));
        check('journal (Send): a page hands the table only the Journal\'s own picture — its file in this machine\'s journal folder, or the small picture kept inside the index; a page whose picture names the save, the profile store, a backup, an index, another folder, a walk, a blob, a page or a web address reads nothing (no fetch at all), sends nothing and says the picture could not be read',
            shSrc.length > 400 && badRuns.every(W => !W.err && W.fetched.length === 0 && W.shared.length === 0 && JSON.stringify(W.toasts) === JSON.stringify(['That picture could not be read from your journal.']))
            && goodRuns.every((W, i) => !W.err && JSON.stringify(W.fetched) === JSON.stringify([goodSrc[i]]) && W.shared.length === 1 && W.shared[0].to === 'gm' && W.shared[0].entry.kind === 'image' && W.shared[0].entry.data.length === 4 && W.toasts[0] === '"Pic" sent to GM.'),
            [badRuns.map(W => [W.err, W.fetched.length, W.shared.length]), goodRuns.map(W => [W.err, W.fetched, W.shared.length])]);
    }

    /* ---- Settings' snapshots: Delete and Restore act only on a yes (settings.js, sliced by its snaps markers and run on a recording page; the page's
       dialogs module is handed in where the handler imports it) ---- */
    {
        let snapSrc = ''; try { snapSrc = slice('settings.js', 'snaps'); } catch (e) { snapSrc = ''; }
        const mkS = (answer, net) => {
            const w = { asked: [], fetched: [], toasts: [], reloaded: 0, err: '' }; let handler = null;
            const listEl = { addEventListener: (ev, fn) => { if (ev === 'click') handler = fn; } };
            const dialogs = { showConfirm: (msg, cb) => { w.asked.push(msg); return cb(answer); } };   // dialogs.js calls back with true (OK, Enter) or false (Cancel, Escape)
            try { new Function('ui', '__dialogs', 'fetch', 'toast', 'loadSnapshots', 'window', 'location', 'setTimeout', snapSrc.split("await import('./dialogs.js')").join('__dialogs'))(() => listEl, dialogs, async (u, init) => { w.fetched.push([u, JSON.parse(init.body).file]); return { ok: true }; }, t => w.toasts.push(t), () => {}, { wpNet: net || null }, { reload() { w.reloaded++; } }, fn => fn()); } catch (e) { w.err = String(e && e.message); }
            w.click = async (file, cls) => { if (!handler) { w.err = w.err || 'no handler'; return; } const row = { dataset: { file }, querySelector: () => ({ textContent: 'then' }) }; await handler({ target: { closest: sel => (sel === '.snap-row' ? row : sel === cls ? {} : null) } }); await new Promise(r => setImmediate(r)); };
            return w;
        };
        const no = mkS(false); await no.click('data-2026-10-01-09-00-00.json', '.snap-del'); await no.click('keep-2026-10-01-09-30-00.json', '.snap-del'); await no.click('data-2026-10-01-09-00-00.json', '.snap-restore');
        const yes = mkS(true); await yes.click('data-2026-10-01-09-00-00.json', '.snap-del'); await yes.click('keep-2026-10-01-09-30-00.json', '.snap-del'); await yes.click('data-2026-10-01-09-00-00.json', '.snap-restore');
        const atTable = mkS(true, { active: true }); await atTable.click('data-2026-10-01-09-00-00.json', '.snap-restore');
        check('settings (snapshots): Delete and Restore act only on a yes — answered Cancel or Escape, nothing is asked of the saves folder: no snapshot deleted, the save not replaced, no reload; answered OK, the snapshot named is deleted or restored (then the reload); a restore is refused at a table before it is even asked; the question for a launch backup says it is set aside in backups/removed, the one for a snapshot taken by hand does not',
            snapSrc.length > 400 && !no.err && no.asked.length === 3 && no.fetched.length === 0 && no.toasts.length === 0 && no.reloaded === 0
            && !yes.err && JSON.stringify(yes.fetched) === JSON.stringify([['/api/delete-backup', 'data-2026-10-01-09-00-00.json'], ['/api/delete-backup', 'keep-2026-10-01-09-30-00.json'], ['/api/restore-backup', 'data-2026-10-01-09-00-00.json']]) && yes.reloaded === 1
            && atTable.asked.length === 0 && atTable.fetched.length === 0 && /set aside rather than erased: it moves to backups\/removed/.test(no.asked[0] || '') && !/set aside/.test(no.asked[1] || '') && /^Restore the save from then\?/.test(no.asked[2] || ''), [no.err || yes.err, no.asked.length, no.fetched, yes.fetched, yes.reloaded, atTable.asked.length]);
    }

    /* ---- a category's files, from a campaign file's category keys (whiteboard.js catMemberFile, in the catfiles slice) ---- */
    {
        let member = null; try { member = new Function(slice('whiteboard.js', 'catfiles') + '\nreturn typeof catMemberFile === "function" ? catMemberFile : null;')(); } catch (e) { member = null; }
        const keys = ['/saves/images/m_abc/pic.png', '/saves/images/m_abc/Pic 2.JPEG', '/saves/images/journal/c1/journal.json', '/saves/images/journal/journals.json', '/saves/images/journal/c1/h_1.png', '/saves/images/Journal/c1/h_1.png', '/saves/images/journal./c1/h.png', '/saves/images/video/x/abcd1234_v.mp4', '/saves/images/audio/x/abcd1234_s.ogg',
            '/saves/images/../data.json', '/saves/images/m/../../data.json', '/saves/images//x.png', '/saves/images/m/.. /x.png', '/saves/images/pic.png', '/saves/data.json', 'https://evil.example/a.png', '/saves/images/m\\x.png', '/saves/images/m/a.png?x', 7, null];
        const kept = member ? keys.filter(member) : null;
        check('category files: of a category\'s keys (they come from a campaign file) only a picture the Image Library itself lists may be offered for deletion with it — never a journal\'s index, the registry or a page\'s picture, another campaign\'s video or sound, a path that walks or holds an empty segment, a file outside the pictures\' folders, a web address or a value that is no path; the Delete category handler filters its members through it',
            JSON.stringify(kept) === JSON.stringify(['/saves/images/m_abc/pic.png', '/saves/images/m_abc/Pic 2.JPEG']) && /var members = Object\.keys\(cc\.by\)\.filter\(function\(p\) \{ return tagsIn\(cc, p\)\.indexOf\(del\) >= 0 && catMemberFile\(p\); \}\);/.test(read('whiteboard.js')), [kept]);
    }

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})().catch(function(e) { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); process.exit(1); });

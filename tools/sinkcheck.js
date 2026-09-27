/* Offline check of the GM's own renderers against a campaign from a file someone else made (a Merge or Replace import).
   The GM's screen shows such a campaign through the same renderers as their own work, so whatever the file carries must
   reach markup, a style, a URL or a disk path only through a check: text escaped, formatted text through the page
   sanitiser, colours that are colours, numbers that are numbers, pictures that are the app's own (the owner's rule: a
   picture never loads from outside the app), and a category's files deleted only when they are that category's own.
   Runs the REAL code: safecore.js and docrender.js as modules, the renderers sliced out of planner.js, inspector.js,
   whiteboard.js, sheets.js and music.js by their [sinkcheck:...] markers (never copied), and index.html's mermaid config,
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
    const plannerPreviewHtml = new Function('esc', 'sanitizeHtml', 'proseHtml', 'stripMermaidLinks', 'compileFlowchart', 'docStyleCss', 'mergeDocStyle', 'num', 'picRef',
        slice('planner.js', 'planner-preview') + '\nreturn plannerPreviewHtml;')(SC.esc, DR.sanitizeHtml, DR.proseHtml, DR.stripMermaidLinks, DR.compileFlowchart, DR.docStyleCss, DR.mergeDocStyle, SC.num, SC.picRef);
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

    /* ---- the planner editor's rich-text boxes (planner.js rteInitial): a contenteditable is markup too ---- */
    const rteInitial = new Function('nl', 'sanitizeHtml', slice('planner.js', 'rte') + '\nreturn rteInitial;')(DR.nl, DR.sanitizeHtml);
    const rteHostile = [{ type: 'lede', content: 'Lede ' + T }, { type: 'text', content: '<p onclick="x">t</p><img src="' + U + '">' }, { type: 'flare', content: '<div style="background:url(//evil.example/f)">f</div>' }, { type: 'callout', content: '<iframe src="//evil.example"></iframe>' }].map(rteInitial).join('');
    check('planner editor: a box built from a hostile block runs and loads nothing', risks(rteHostile).length === 0 && rteHostile.indexOf('evil.example') < 0, risks(rteHostile));
    check('planner editor: the formatting the bar makes stays as typed', rteInitial({ type: 'text', content: '<p><b>B</b> <i>I</i> <u>U</u> <s>S</s></p><ul><li>one</li></ul><ol><li>two</li></ol>' }) === '<p><b>B</b> <i>I</i> <u>U</u> <s>S</s></p><ul><li>one</li></ul><ol><li>two</li></ol>');
    check('planner editor: typed line breaks still become paragraphs and breaks', rteInitial({ type: 'text', content: 'a\n\nb\nc' }) === '<p>a</p><p>b<br>c</p>' && rteInitial({ type: 'lede', content: 'x\ny' }) === 'x<br>y' && rteInitial({ type: 'callout', content: '' }) === '');

    /* ---- mermaid: a diagram's labels are HTML mermaid cleans itself — the app's config (index.html) forbids pictures, styles and links ---- */
    const idx = fs.readFileSync(path.join(dir, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
    const mm = /window\.wpMermaidConfig = (\{[\s\S]*?\});\n/.exec(idx);
    const mcfg = mm ? new Function('return (' + mm[1] + ');')() : {};
    const dp = mcfg.dompurifyConfig || {}, ft = dp.FORBID_TAGS || [], fa = dp.FORBID_ATTR || [];
    check('mermaid config: labels keep no picture, frame, svg or style element', ['img', 'image', 'picture', 'source', 'video', 'audio', 'iframe', 'object', 'embed', 'svg', 'style', 'link'].every(t => ft.indexOf(t) >= 0), ft);
    check('mermaid config: labels keep no style, src, srcset or href attribute', ['style', 'src', 'srcset', 'href', 'xlink:href', 'background', 'poster'].every(a => fa.indexOf(a) >= 0), fa);
    check('mermaid config: a diagram\'s own %%{init}%% cannot change the label rules or the security level', ['dompurifyConfig', 'securityLevel', 'secure'].every(k => (mcfg.secure || []).indexOf(k) >= 0), mcfg.secure);
    check('mermaid config: the GM\'s own mode is unchanged (loose; players get strict from handbook.js)', mcfg.securityLevel === 'loose' && mcfg.startOnLoad === false && !!mcfg.flowchart);

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
    }
    delete global.window;

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})().catch(function(e) { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); process.exit(1); });

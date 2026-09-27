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
            const out = { after: 0, sent: [], toasts: [], uploads: [], flush: 0, remoteAtSave: null };
            const netF = { active: true, role: 'host', applyingRemote: false, roster: { pA: { id: 'u_a', color: '#445566' } }, cleanFace: hC.cleanFace, safeAvatar: hC.safeAvatar, FACE_PICS: hC.FACE_PICS, broadcastItemFiltered: (c, m) => out.sent.push(m) };
            const api = new Function('getActiveCampaign', 'charById', 'net', 'afterCharChange', 'toast', 'window', 'pngOf', 'copyBundled', 'uploadExact', shS.slice(tcA, tcB) + '\n' + slice('sheets.js', 'charface') + '\nreturn applyCharFace;')(
                () => camp, (id, cp) => (cp || camp).chars[id] || null, () => netF, () => { out.after++; out.remoteAtSave = netF.applyingRemote; }, t => out.toasts.push(t),
                { wpHistFlush: () => { out.flush++; } },
                () => Promise.resolve('PNG'), name => Promise.resolve({ portrait: '/saves/images/tutorial/' + name + '_sq.jpg', token: '/saves/images/tutorial/' + name + '_hex.png' }),
                (rel) => { out.uploads.push(rel); return Promise.resolve(o.url || '/saves/' + rel); });
            return { api, camp, tok: tokA, other, out, netF };
        };
        const A = mkC(), B = mkC(), C = mkC(), D = mkC({ char: { portrait: '/saves/images/x.png' } }), E = mkC({ tok: { type: 'image', src: '/saves/images/art.png', color: 'transparent' } }), F = mkC({ url: 'https://evil.example/x.png' }), G = mkC(), H2 = mkC();
        const rA = await A.api('c_1', { kind: 'face', face: '\u{1F409}' }, false), rB = await B.api('c_1', { kind: 'bundled', name: 'orc' }, false), rC = await C.api('c_1', { kind: 'picture', data: 'data:image/png;base64,AAAA' }, false);
        const rD = await D.api('c_1', { kind: 'face', face: '\u{1F409}' }, false), rE = await E.api('c_1', { kind: 'face', face: '\u{1F409}' }, true), rF = await F.api('c_1', { kind: 'picture', data: 'data:image/png;base64,AAAA' }, false);
        const rG = await G.api('c_1', { kind: 'bundled', name: '../../etc' }, false), rH = await H2.api('c_1', { kind: 'face', face: '<img src=x>' }, false);
        check('F1c applyCharFace (run for real): an emoji face is drawn on the character\'s own tokens (none else) and its portrait stays bare; a bundled picture and a saved photo become its portrait and its tokens\' art; a give never overwrites a picture it has (its portrait or a token\'s art), an owner\'s change does (back to a circle in their colour); a saved address that is not the app\'s own, a bundled name off the list or a refused face changes nothing',
            rA === true && A.tok.face === '\u{1F409}' && !('face' in A.other) && A.camp.chars.c_1.portrait === '' && A.out.after === 1 && j(A.out.sent) === j(['m1'])
            && rB === true && B.camp.chars.c_1.portrait === '/saves/images/tutorial/orc_sq.jpg' && B.tok.type === 'image' && B.tok.src === '/saves/images/tutorial/orc_hex.png'
            && rC === true && C.camp.chars.c_1.portrait === '/saves/images/portraits/portrait-c_1-a.png' && C.tok.src === C.camp.chars.c_1.portrait && j(C.out.uploads) === j(['images/portraits/portrait-c_1-a.png'])
            && rD === false && D.camp.chars.c_1.portrait === '/saves/images/x.png' && !('face' in D.tok) && rE === true && E.tok.type === 'circle' && !('src' in E.tok) && E.tok.color === '#445566' && E.tok.face === '\u{1F409}'
            && rF === false && F.camp.chars.c_1.portrait === '' && !F.tok.src && rG === false && G.tok.type === 'circle' && rH === false && !('face' in H2.tok), JSON.stringify([rA, A.tok, rB, B.tok, rC, C.camp.chars.c_1.portrait, rD, rE, E.tok, rF, rG, rH]));
        {   // Onboarding F1c review: applyCharFace keeps the face on the character, a give never overwrites a face, the picture names take turns, never the GM's undo step
            const I = mkC({ tok: { face: '\u{1F408}' } }), J = mkC({ char: { face: 'default' } }), K = mkC({ char: { portrait: '/saves/images/portraits/portrait-c_1-a.png' } }), L = mkC({ char: { face: '\u{1F409}' } }), M = mkC();
            const rI = await I.api('c_1', { kind: 'face', face: '\u{1F409}' }, false), rJ = await J.api('c_1', { kind: 'face', face: '\u{1F409}' }, false), rK = await K.api('c_1', { kind: 'picture', data: 'data:image/png;base64,AAAA' }, true), rL = await L.api('c_1', { kind: 'bundled', name: 'orc' }, true);
            const rM = await M.api('c_1', { kind: 'face', face: '\u{1F409}' }, false);
            check('F1c applyCharFace keeps the face on the character (a token made later wears it; a picture clears it); a give never overwrites a face it has (its own or a token\'s); a new picture takes the other of its two file names; the change is never a step of the GM\'s undo (their pending edit is recorded first)',
                rI === false && I.tok.face === '\u{1F408}' && rJ === false && J.camp.chars.c_1.face === 'default' && !('face' in J.tok) && rK === true && K.camp.chars.c_1.portrait === '/saves/images/portraits/portrait-c_1-b.png' && j(K.out.uploads) === j(['images/portraits/portrait-c_1-b.png'])
                && rL === true && !('face' in L.camp.chars.c_1) && rM === true && M.camp.chars.c_1.face === '\u{1F409}' && M.out.flush === 1 && M.out.remoteAtSave === true && M.netF.applyingRemote === false && K.out.remoteAtSave === true && K.netF.applyingRemote === false,
                j([rI, rJ, rK, K.out.uploads, rL, L.camp.chars.c_1, rM, M.out]));
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
    delete global.window;

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})().catch(function(e) { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); process.exit(1); });

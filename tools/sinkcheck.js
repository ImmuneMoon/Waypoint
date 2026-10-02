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
        check('item 19 H2 height words (wiring): the ruler adds the height only through rulerHeightText between two tokens, a target mark only through targetHeightHtml from each targeter\'s token, its signature carrying each height and the viewer\'s unit',
            wbL.includes("var hgR = bothTok ? heightSeen(tA, tB) : null;") && wbL.includes("if (hgR) html += rulerHeightText(mx + 8,") && wbL.includes("var thgt = tgs.map(function(t) { var mh = targeterTok(t.id, activeMap); return mh && mh !== item ? heightSeen(mh, item) : null; });")
            && wbL.includes("tsig += '|' + thgt.map(function(h) { return h ? h.mod + ':' + h.diff : ''; }).join(',') + '|' + (state.measureUnit || '');") && (wbL.match(/rulerHeightText\(/g) || []).length === 2 && (wbL.match(/targetHeightHtml\(/g) || []).length === 2);
        check('range box and words (wiring): the Combat card builds the Range box before the Light box and hands its events on after the Senses box; the ruler and a target mark add the range only through rulerRangeText and targetRangeHtml',
            /\n    rangeBox\(box, cm\);[^\n]*\n    heightBox\(box, cm\);[^\n]*\n    lightBox\(box, cm\);/.test(shL) && /if \(onSensesInput\(t\)\) return;[^\n]*\n\s*if \(onRangeInput\(t\)\) return;/.test(shL) && /if \(sensesClick\(b\)\) return;[^\n]*\n\s*if \(rangeClick\(b\)\) return;/.test(shL)
            && (wbL.match(/rulerRangeText\(/g) || []).length === 2 && (wbL.match(/targetRangeHtml\(/g) || []).length === 2 && !/rgR\.mod|trng\[ti\]\.mod/.test(wbL));
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
            const vals = [ui, async () => journals, () => null, () => [], readIndex, async (k, fn) => { const ix = await readIndex(k); fn(ix); return ix; }, {}, () => 'all', {}, () => '', () => '', () => {}, () => {}, escApp, SC.picRef, wnd, fetchS, t => w.toasts.push(t), { querySelector: () => null }];
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

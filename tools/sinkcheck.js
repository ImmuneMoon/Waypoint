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
    delete global.window;

    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})().catch(function(e) { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); process.exit(1); });

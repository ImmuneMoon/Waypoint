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
    return styles.every(s => /^style="((color:#[0-9a-f]{6};|font-weight:bold;|font-style:italic;|text-decoration:(underline|line-through|underline line-through);|font-size:(0\.833|1\.2|1\.44|1\.728)em;|width:\d+%;|height:\d+px;|width:\d+px;|position:relative;left:-?\d+px;top:-?\d+px;)*)"$/.test(s));
}

// every link in a rendered page is the sanitiser's own form: an http(s) address, the fixed target and rel, nothing else
function linksOk(html) { return (html.match(/<a\b[^>]*>/g) || []).every(a => /^<a href="https?:\/\/[^"<>\s]+" target="_blank" rel="noopener noreferrer">$/i.test(a)); }

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
        {   // a directive wherever it stands in a line (a diagram's link and callback statements never reach the diagram library)
            const same = s => stripMermaidLinks(s) === s;
            check('stripMermaidLinks (a directive wherever it stands in a line): a statement ends at a line break or at a ; and a line is cut at the first statement that begins with click, callback, href or linkStyle — the diagram before it stays, a line left empty goes; the ; that closes one of the diagram library\'s own #…; entities is part of the entity; a line that holds no directive is returned as it was',
                stripMermaidLinks('graph TD; A-->B; click A href "ftp://x"') === 'graph TD; A-->B'
                && stripMermaidLinks('graph TD\nA-->B;click A call f()\nC-->D') === 'graph TD\nA-->B\nC-->D'
                && stripMermaidLinks('graph TD\nA-->B ;  CALLBACK A "f"; C-->D') === 'graph TD\nA-->B '
                && stripMermaidLinks('graph TD\n ;\tclick A "u"\nC-->D;href A "u";') === 'graph TD\nC-->D'
                && stripMermaidLinks('graph TD\nA-->B#; click A "u"\nC-->D #x y; linkStyle 0 stroke:red') === 'graph TD\nA-->B#\nC-->D #x y'
                && same('graph TD\nA["say #quot;click#quot; #35;1; fine"]-->B;') && same('graph TD\nA["x #quot; click A y"]-->B #x1;click A "u"') && same('graph TD\nA-->B; C-->D;\nclicker-->hrefs; callbacks-->linkStyles') && same('') && stripMermaidLinks(null) === '' && same('a\r\nb') === false && stripMermaidLinks('a\r\nb') === 'a\nb');
            check('stripMermaidLinks (a class diagram\'s and a sequence diagram\'s links): link <name> "address" goes wherever it stands; in a sequence diagram a link or links line of an actor goes; a node, a class or a task that is merely called link — an arrow from it, its members, a line of a chart that begins with the word — is left as it was',
                stripMermaidLinks('classDiagram\nclass S\nlink S "ftp://x"') === 'classDiagram\nclass S'
                && stripMermaidLinks('classDiagram\nclass S; link S "ftp://x" "tip"\nclass T') === 'classDiagram\nclass S\nclass T'
                && stripMermaidLinks('classDiagram\nclass `A B`\n  LINK `A B` \'https://x\'') === 'classDiagram\nclass `A B`'
                && stripMermaidLinks('sequenceDiagram\nparticipant Alice\nlink Alice: Dashboard @ https://x\nlinks Alice: {"a": "https://x"}\nAlice->>Bob: hi; link Bob: /api/data\nBob->>Alice: ok') === 'sequenceDiagram\nparticipant Alice\nAlice->>Bob: hi\nBob->>Alice: ok'
                && same('graph TD\nlink --> B["x"]\nlink["Link"] --> zelda\nlinks --> C\nA --> link; link  -.-> D["y"]') && same('gantt\nsection A\nLink the docs :a1, 2024-01-01, 3d\nlinks review :a2, after a1, 2d') && same('journey\ntitle x\nLink accounts: 5: Me')
                && same('classDiagram\nlink <|-- Other\nlink : +go()\nlink "1" --> "*" Other\nlinked "1" --> "*" Other'));
            const lab = 'Wait; click the lever; link it "now"; href x', fcb = { type: 'flowchart', nodes: [{ id: 'a', text: lab }, { id: 'click', text: 'x' }], edges: [{ from: 'a', to: 'click', text: 'go; callback x' }] }, fcm = compileFlowchart(fcb);
            const fs2 = require('fs'), srcOf = f => fs2.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8');
            check('stripMermaidLinks (the app\'s own compiled flowchart): judged by whole lines only, exactly as before — every label is one quoted string there, so a label that says "; click …" stays whole on a page and in a planner (without the mark the same text would be cut: the rule fails closed); the two places that draw a compiled flowchart pass the mark and no other place does',
                stripMermaidLinks(fcm, true) === fcm.split('\n').filter(l => !/^click\b/.test(l)).join('\n') && stripMermaidLinks(fcm, true).indexOf('a["Wait; click the lever; link it #quot;now#quot;; href x"]:::neutral') > 0 && stripMermaidLinks(fcm, true).indexOf('a -->|"go; callback x"| click') > 0
                && stripMermaidLinks(fcm).indexOf('a["Wait\n') > 0 && stripMermaidLinks('x\nclick A "u"\ny; click B "u"', true) === 'x\ny; click B "u"' && stripMermaidLinks('x\ny; click B "u"', 1) === 'x\ny' && stripMermaidLinks('x\ny; click B "u"', 'true') === 'x\ny'
                && renderDoc({ type: 'doc', blocks: [fcb] }).indexOf('a[&quot;Wait; click the lever; link it #quot;now#quot;; href x&quot;]:::neutral') > 0
                && (srcOf('docrender.js').match(/stripMermaidLinks\([^()]*(\([^()]*\))?[^()]*, true\)/g) || []).join('|') === 'stripMermaidLinks(compileFlowchart(b), true)' && (srcOf('planner.js').match(/stripMermaidLinks\([^()]*(\([^()]*\))?[^()]*, true\)/g) || []).join('|') === 'stripMermaidLinks(m, true)'
                && !/stripMermaidLinks\([^\n]*true/.test(srcOf('cleanup.js')), stripMermaidLinks(fcm, true));
            const t0 = Date.now(), big = [';'.repeat(200000), '; link a'.repeat(25000), '#a'.repeat(100000) + ';', ' '.repeat(200000) + ';' + ' '.repeat(200000), ('a'.repeat(50) + ';').repeat(4000) + ' click A "u"'].map(s => stripMermaidLinks('sequenceDiagram\n' + s).length);
            check('stripMermaidLinks (a long line): 200,000 characters of separators, of half-directives, of entity-like runs and of spaces are each walked once (well under two seconds together), and a directive at the very end of such a line is still found', Date.now() - t0 < 2000 && big[4] === 'sequenceDiagram\n'.length + 51 * 4000 - 1, [Date.now() - t0, big]);
            const mp = D.mermaidPre, dec = h => h.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');   // the pre's markup with its character references read once, as the diagram library reads it
            const HIDDEN = ['graph TD\nQ-->R\n&#99;lick Q call f("1")', 'graph TD\nQ-->R\n&#x63;lick Q href "https://a.example/"', 'graph TD\nQ-->R&#59; click Q call f()', 'graph TD\nQ-->R&semi; click Q call f()', 'graph TD\nQ-->R&#10;click Q call f()', 'graph TD\nQ-->R\ncl<x>ick Q call f()', 'graph TD\nQ-->R\ncl<!-- -->ick Q "https://a.example/"', 'graph TD\nQ-->R\n<b></b>click Q call f()',
                'graph TD\nQ-->R\n&amp;#99;lick Q call f()\n&#99;lick Q call f()', 'classDiagram\nclass Q-->R\n&#108;ink Q "https://a.example/"', 'sequenceDiagram\nQ-->R: hi\n&#108;inks Q: {"a": "https://a.example/"}', 'graph TD; Q-->R; click Q call f()'];
            const HONEST = ['graph TD\nA[one<br>two] --> B{"a &amp; b"}\nB -->|x &lt; y| C\nC --> D["say #quot;click#quot; #35;1"]', 'graph TD\nA-->B', '', 'sequenceDiagram\nAlice->>Bob: 5 &gt; 3; ok'];
            const directive = t => t.split('\n').some(l => !(D.readLinkLine && D.readLinkLine(l)) && l.split(';').some(s => /^\s*(click|callback|href|link|links)\b/i.test(s)));   // (a whole canonical line — click <id> href "<address>", written by the strip — is no directive left over)
            const got = typeof mp === 'function' ? HIDDEN.map(mp) : [];
            check('mermaidPre (a planner\'s diagram block, as the diagram library will read it): the library reads the pre\'s markup with its character references read once — a directive written with a character reference, split by a tag or a comment, or made by a separator written as one is in what it would read, so that text is judged again and handed over stripped (the rest of the diagram stays, a reference written twice stays the text it was); a diagram that hides none is handed over exactly as the sanitiser writes it, as before',
                typeof mp === 'function' && got.length === HIDDEN.length && got.every(o => !directive(dec(o)) && dec(o).indexOf('Q-->R') > 0 && stripMermaidLinks(dec(o)) === dec(o)) && dec(got[8]).indexOf('\n&#99;lick Q call f()') > 0
                && HONEST.every(s => mp(s) === sanitizeHtml(s)) && mp(null) === '', JSON.stringify(got).slice(0, 600));
            check('stripMermaidLinks (the source as the diagram library will read it): a lone carriage return is a line break and a NUL is taken out, as a page reads them; the library\'s own %%{…}%% blocks, which it takes out wherever they stand before it reads a diagram, are taken out with its own pattern and what is left is judged again — a directive split by a block, standing behind one, behind one that runs over several lines or inside nested ones is found, and the source is then handed over without its blocks; a source with blocks that hides none (a theme, an unclosed block, a comment that names a directive) is returned as it was',
                stripMermaidLinks('graph TD\nA-->B\rclick A call f()\rC-->D') === 'graph TD\nA-->B\nC-->D' && stripMermaidLinks('graph TD\nA-->B\ncl\u0000ick A call f()') === 'graph TD\nA-->B' && stripMermaidLinks('graph TD\nA\u0000-->B') === 'graph TD\nA-->B'
                && stripMermaidLinks('graph TD\nA-->B\ncl%%{a}%%ick A call f()') === 'graph TD\nA-->B' && stripMermaidLinks('%%{init: {"theme":"dark"}}%% click A call f()\ngraph TD\nA-->B') === 'graph TD\nA-->B'
                && stripMermaidLinks('graph TD\nA-->B\n%%{init: {\n"theme": "dark"\n}}%%click A call f()') === 'graph TD\nA-->B' && stripMermaidLinks('graph TD\nA-->B\ncl%%{%%{a}%%b}%%ick A call f()') === 'graph TD\nA-->B'
                && stripMermaidLinks('classDiagram\nclass S\n%%{x}%%link S "ftp://x"') === 'classDiagram\nclass S' && stripMermaidLinks('graph TD\nA-->B%%{x}%%; %%{y}%%click A "u"') === 'graph TD\nA-->B'
                && same('%%{init: {"theme": "dark"}}%%\ngraph TD\nA-->B') && same('graph TD\n%%{init: x\nA-->B') && same('graph TD\n%% click A "u" is only a comment\nA-->B %%{note}%% \nB-->C')
                && typeof mp === 'function' && !directive(dec(mp('graph TD\nQ-->R\ncl%%{a}%%ick Q call f()'))) && !directive(dec(mp('graph TD\nQ-->R\n&#99;l%%{a}%%ick Q call f()'))) && !directive(dec(mp('graph TD\nQ-->R\n%&#37;{a}%%click Q call f()'))),
                [stripMermaidLinks('graph TD\nA-->B\ncl%%{a}%%ick A call f()'), stripMermaidLinks('graph TD\nA-->B%%{x}%%; %%{y}%%click A "u"')]);
        }
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
        {   // a block with no colour or size: where Markdown's own marks would not read back (a bold part inside an italic), the export writes the tags
            const rt = h => { const md = docToMarkdown({ type: 'doc', meta: { title: 'T' }, blocks: [{ id: 'b1', type: 'h1', title: 'T' }, { id: 'b2', type: 'text', content: h }] }, {}).text; const back = markdownToBlocks(md, { kind: 'doc' }).blocks.filter(b => b.type === 'text').map(b => b.content).join('|'); return { md, back }; };
            const nest = ['<p><i>a <b>word</b></i> x</p>', '<p><i><b>word</b> a</i> x</p>', '<p><b>a <i>word</i></b> x</p>', '<p><s>a </s>b</p>'];
            const plainOnes = ['<p>a <b>bold</b> and <i>it</i> word</p>', '<p><b><i>both</i></b> x</p>', '<p>plain</p>'];
            const rN = nest.map(rt), rP = plainOnes.map(rt);
            check('Markdown export, a text block with no colour: where its own bold and italic marks would not read back (a bold part inside an italic, a strike-through ending in a space) the tags are written and the block reads back exactly; where the marks do read back they are written as ever (no tag appears)',
                rN.every((r, i) => r.back === nest[i]) && rP.every((r, i) => r.back === plainOnes[i] && !/<[bis]>/.test(r.md)), JSON.stringify([rN.map((r, i) => r.back === nest[i] ? null : [nest[i], r.md, r.back]).filter(Boolean), rP.map((r, i) => r.back === plainOnes[i] && !/<[bis]>/.test(r.md) ? null : [plainOnes[i], r.md, r.back]).filter(Boolean)]));
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
        // a planner with a scene node and raw block round-trips its own way
        const plItems = { m1: { id: 'm1', type: 'map', meta: { title: 'Ahto East' }, rooms: [{ id: 'r9', name: 'Cargo lock' }] } };
        const pl = { type: 'planner', id: 'plan_1', meta: { title: 'Session', status: 'next' }, blocks: [{ type: 'h1', title: 'Session', sub: '' }, { type: 'node', title: 'The docks', tag: 'Stealth', must: 'Who?', linkMapId: 'm1', linkRoomId: 'r9', cols: ['Action', 'Why'], rows: [{ col1: 'Bribe', col2: 'fast' }] }, { type: 'node', mode: 'table', title: 'NPCs', cols: ['Name'], rows: [{ col1: 'Vane' }] }, { type: 'raw', content: '<b>raw</b>' }] };
        const plx = docToMarkdown(pl, { items: plItems });
        check('planner export: status, scene node with map line and table, raw as an html fence', /status: next/.test(plx.text) && plx.text.indexOf('### Scene: The docks\n**Tag:** Stealth\n**Must resolve:** Who?\nMap: Ahto East / Cargo lock\n| Action | Why |') > 0 && plx.text.indexOf('**NPCs**\n| Name |') > 0 && plx.text.indexOf('```html\n<b>raw</b>\n```') > 0, plx.text);
        const plb = markdownToBlocks(plx.text, { kind: 'planner', items: plItems });
        check('planner round trip: scene node, table node, html fence as code (never raw)', types(plb) === 'h1,node,node,text' && plb.blocks[1].linkRoomId === 'r9' && plb.blocks[1].rows[0].col1 === 'Bribe' && plb.blocks[2].mode === 'table' && /<pre><code>&lt;b&gt;raw/.test(plb.blocks[3].content) && plb.meta.status === 'next', types(plb) + ' ' + JSON.stringify(plb.blocks[3]));
        // text style in Markdown: a format travels — bold and italic as the dialect's own marks, a colour and a size as the page sanitiser's one span form
        {
            const RED = '#d9534f', GREEN = '#5cb87a', cleanBlockFmtsD = D.cleanBlockFmts, sha = s => require('crypto').createHash('sha256').update(s, 'utf8').digest('hex');
            const noIds = bs => bs.map(b => { const o = Object.assign({}, b); delete o.id; return o; });
            const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x);
            const unstyle = it => { const p = JSON.parse(JSON.stringify(it)); p.blocks.forEach(b => { delete b.fmt; delete b.colFmt; delete b.rowFmt; (b.rows || []).forEach(r => { if (r && !Array.isArray(r)) delete r.fmt; }); (b.nodes || []).forEach(n => delete n.fmt); (b.edges || []).forEach(e => delete e.fmt); if (typeof b.content === 'string') b.content = b.content.replace(/<\/?span[^>]*>/g, ''); }); return p; };
            // (1) with no format: written and read exactly as before (the hashes were taken on the code before this change)
            const pageMd = docToMarkdown({ type: 'doc', id: 'doc_t', meta: { title: page.meta.title }, blocks: page.blocks }, {}).text, planMd = docToMarkdown({ type: 'planner', id: 'plan_t', meta: { title: plan.meta.title, status: 'next' }, blocks: plan.blocks }, {}).text;
            const outHash = sha([pageMd, planMd, ex.text, plx.text].join('\u0000')), inHash = sha(JSON.stringify([noIds(page.blocks), page.meta, page.notes, page.images, noIds(plan.blocks), plan.meta, plan.notes, plan.images, noIds(back.blocks), noIds(plb.blocks), noIds(sc.blocks), noIds(gd.blocks)]));
            check('Markdown (text style): a document with no format is written byte for byte as before, and a file with no style in it is read exactly as before (the template as a page and as a planner, a page of every block, a planner with a scene: pinned by hash on the code before this change)',
                outHash === '99d3942aefbcd20c65c9fae5ee5692116e75d7b5795f35695acfdfbaf74520d2' && inHash === 'f0037bf9f4a52c805ee8923739c978f9990f6f595364609adb5740d4ba4213c5', [outHash, inHash]);

            // (2) a styled planner: every field kind
            const stPl = { type: 'planner', id: 'plan_s', meta: { title: 'Styled' }, blocks: [
                { type: 'h1', title: 'Session', sub: 'one', fmt: { title: { color: RED, b: true }, sub: { i: true } } }, { type: 'h2', title: 'Beats', fmt: { title: { size: 'huge' } } },
                { type: 'node', title: 'The docks', tag: 'Stealth', must: 'Who?', cols: ['Action', 'Why'], colFmt: [{ b: true }], fmt: { title: { color: RED }, tag: { i: true }, must: { spans: [{ s: 0, e: 3, b: true }] } }, rows: [{ col1: 'Bribe', col2: 'fast', fmt: { col1: { spans: [{ s: 0, e: 2, color: RED, i: true }] } } }] },
                { type: 'text', content: '<p><span style="color:#d9534f">red</span> and <span style="font-size:1.44em"><b>big</b></span></p>' },
                { type: 'flowchart', dir: 'LR', nodes: [{ id: 'a', text: 'buy milk', shape: 'rect', color: 'neutral', fmt: { color: RED, spans: [{ s: 0, e: 3, b: true }] } }, { id: 'b', text: 'done', shape: 'rect', color: 'neutral' }], edges: [{ from: 'a', to: 'b', text: 'then', style: 'solid', fmt: { i: true } }] },
                { type: 'image', src: '', caption: 'cap', fmt: { caption: { b: true } } },
                { type: 'node', mode: 'table', title: 'Loot', cols: ['Item'], rows: [{ col1: 'gold' }], fmt: { title: { b: true } } } ] };
            const mdS = docToMarkdown(stPl, {}).text, mdP = docToMarkdown(unstyle(stPl), {}).text;
            const wantS = ['---', 'title: Styled', 'subtitle: one', '---', '', '# <span style="color:#d9534f">**Session**</span>', '*<i>one</i>*', '', '## <span style="font-size:1.728em">Beats</span>', '',
                '### Scene: <span style="color:#d9534f">The docks</span>', '**Tag:** *Stealth*', '**Must resolve:** **Who**?', '| **Action** | Why |', '|---|---|', '| <span style="color:#d9534f">*Br*</span>ibe | fast |', '',
                '<span style="color:#d9534f">red</span> and <span style="font-size:1.44em">**big**</span>', '', '```flowchart', 'flowchart LR', 'a["<font color=d9534f><b>buy</b> milk</font>"]', 'b["done"]', 'a -->|"<i>then</i>"| b', '```', '', '![**cap**]()', '', '**<b>Loot</b>**', '| Item |', '|---|', '| gold |', ''].join('\n');
            check('Markdown export (text style, a planner): a title, a subtitle, a section, a scene node\'s title, tag and must-resolve, a head, a cell, a text block, a node\'s label, an arrow\'s, a caption and a table\'s title each carry their format — bold and italic as ** and * (as <b> / <i> inside a line that is itself bold or italic syntax), a colour and a size as the one span, a label as the tags mermaid keeps',
                mdS === wantS, mdS);
            const wantP = ['---', 'title: Styled', 'subtitle: one', '---', '', '# Session', '*one*', '', '## Beats', '', '### Scene: The docks', '**Tag:** Stealth', '**Must resolve:** Who?', '| Action | Why |', '|---|---|', '| Bribe | fast |', '',
                'red and **big**', '', '```flowchart', 'flowchart LR', 'a["buy milk"]', 'b["done"]', 'a -->|"then"| b', '```', '', '![cap]()', '', '**Loot**', '| Item |', '|---|', '| gold |', ''].join('\n');
            check('Markdown export (text style): the same planner with no format is written exactly as it always was — no span, no mark it did not have', mdP === wantP, mdP);
            const backS = markdownToBlocks(mdS, { kind: 'planner' }), strip2 = bs => noIds(bs).map(b => { delete b.zoom; delete b.space; return b; });
            check('Markdown round trip (text style, a planner): export then import gives the same blocks — text, formats and structure — and exporting those gives the same Markdown again',
                canon(strip2(backS.blocks)) === canon(strip2(stPl.blocks)) && docToMarkdown({ type: 'planner', id: 'plan_s', meta: { title: 'Styled' }, blocks: backS.blocks }, {}).text === mdS && backS.notes.length === 0, canon(strip2(backS.blocks)) + '\n' + canon(strip2(stPl.blocks)) + '\n' + JSON.stringify(backS.notes));

            // (3) a styled page, in the editor's shape and as a player's app holds it (rows as lists, formats beside them)
            const stPg = { type: 'doc', id: 'doc_s', meta: { title: 'P' }, blocks: [
                { id: 'a', type: 'h1', title: 'Rules', sub: 'v2', fmt: { title: { color: RED }, sub: { b: true } } },
                { id: 'b', type: 'h2', title: 'Combat now', cols: 2, fmt: { title: { size: 'large', color: RED, spans: [{ s: 0, e: 6, color: GREEN }] } } },
                { id: 'c', type: 'h3', title: 'Sub', fmt: { title: { spans: [{ s: 0, e: 1, b: true, i: true }] } } },
                { id: 'd', type: 'callout', content: 'Note <span style="color:#5cb87a">done</span><br><span style="color:#d9534f;font-size:1.2em">todo</span>' },
                { id: 'e', type: 'table', title: 'Loot table', cols: ['Item', 'Worth | gp'], colFmt: [null, { i: true }], rows: [{ col1: 'buy milk', col2: '2', fmt: { col1: { spans: [{ s: 0, e: 4, b: true }] } } }, { col1: 'x*y', col2: '', fmt: { col1: { color: GREEN } } }], fmt: { title: { color: RED, spans: [{ s: 0, e: 4, b: true }] } } },
                { id: 'f', type: 'image', src: '/saves/images/doc_s/ab12cd34_map.png', caption: 'The map', layout: { width: 33, float: 'left' }, fmt: { caption: { i: true } } },
                { id: 'g', type: 'flowchart', dir: 'TD', nodes: [{ id: 'n1', text: 'buy milk\nwalk "dog" #1', shape: 'rect', color: 'gold', fmt: { size: 'larger', color: RED, spans: [{ s: 0, e: 8, color: GREEN }] } }, { id: 'n2', text: 'done', shape: 'pill', color: 'neutral', fmt: { b: true, i: true } }], edges: [{ from: 'n1', to: 'n2', text: 'go', style: 'dotted', fmt: { color: GREEN } }] } ] };
            const mdG = docToMarkdown(stPg, {}).text;
            const wantG = ['---', 'title: P', 'subtitle: v2', '---', '', '# <span style="color:#d9534f">Rules</span>', '*<b>v2</b>*', '', '## <span style="color:#d9534f;font-size:1.2em"><span style="color:#5cb87a">Combat</span> now</span> {cols=2}', '', '### ***S***ub', '',
                '> [!callout] Note <span style="color:#5cb87a">done</span>  ', '> <span style="color:#d9534f;font-size:1.2em">todo</span>', '', '**<span style="color:#d9534f"><b>Loot</b> table</span>**', '| Item | *Worth \\| gp* |', '|---|---|', '| <b>buy </b>milk | 2 |', '| <span style="color:#5cb87a">x\\*y</span> |  |', '',
                '![*The map*](images/doc_s/map.png){width=33 float=left}', '', '```flowchart', 'flowchart TD', 'n1["<big><big><font color=d9534f><font color=5cb87a>buy milk</font><br>walk #quot;dog#quot; #35;1</font></big></big>"]:::gold', 'n2(["<b><i>done</i></b>"])', 'n1 -.->|"<font color=5cb87a>go</font>"| n2', '```', ''].join('\n');
            check('Markdown export (text style, a page): the field\'s own colour and size are one span around everything with the parts inside it; a bold part that ends in a space, a cell with a | or a * in it, a title inside its bold line and a label with a line break, a quote and a # are each written so they read back',
                mdG === wantG, mdG);
            const held = cleanDoc(stPg);
            check('Markdown export (text style): a page as a player\'s app holds it — rows as lists, their formats beside them in rowFmt — is written the same', Array.isArray(held.blocks[4].rows[0]) && !!held.blocks[4].rowFmt && docToMarkdown(held, {}).text === mdG, docToMarkdown(held, {}).text);
            const backG = markdownToBlocks(mdG, { kind: 'doc' }), stripG = bs => strip2(bs).map(b => { delete b.src; return b; });
            const again = JSON.parse(JSON.stringify(backG.blocks)); again[5].src = stPg.blocks[5].src;
            check('Markdown round trip (text style, a page): export then import gives the same blocks — a title\'s and a subtitle\'s format, a section\'s own colour and size with its coloured part, a table\'s title, heads and cells, a caption, a node\'s and an arrow\'s label, a quote\'s spans — and the same Markdown on a second export',
                canon(stripG(backG.blocks)) === canon(stripG(JSON.parse(JSON.stringify(stPg.blocks)))) && backG.meta.subtitle === 'v2' && docToMarkdown({ type: 'doc', id: 'doc_s', meta: { title: 'P' }, blocks: again }, {}).text === mdG, canon(stripG(backG.blocks)) + '\n' + canon(stripG(JSON.parse(JSON.stringify(stPg.blocks)))));
            check('Markdown round trip (text style): what comes in is clean and draws as the original does — every format is the cleaner\'s own, and the imported page renders exactly as the styled one',
                (() => { const a = JSON.parse(JSON.stringify(backG.blocks)); a.forEach(cleanBlockFmtsD); return JSON.stringify(a) === JSON.stringify(backG.blocks); })()
                && renderDoc({ type: 'doc', blocks: again.map((b, k) => Object.assign({}, b, { id: stPg.blocks[k].id })) }, { mermaid: false }) === renderDoc(stPg, { mermaid: false }), '');

            // (4) what the dialect cannot carry is written plain or normalised, never broken
            const one = (title, fmt) => docToMarkdown({ type: 'doc', id: 'd', meta: { title: 'T' }, blocks: [{ type: 'h2', title, fmt: { title: fmt } }] }, {}).text.split('\n')[4];
            const h2back = line => { const b = markdownToBlocks(line, { kind: 'doc' }).blocks[0]; return [b.title, b.fmt && b.fmt.title]; };
            check('Markdown export (text style): the marks are used only where they read back — a bold part ending in a space, an italic next to a bold, a part beside a literal * are written as <b> / <i>; each reads back to the same text and looks',
                one('buy milk', { spans: [{ s: 0, e: 4, b: true }] }) === '## <b>buy </b>milk' && one('ab', { spans: [{ s: 0, e: 1, i: true }, { s: 1, e: 2, b: true }] }) === '## <i>a</i><b>b</b>' && one('a*b', { spans: [{ s: 0, e: 1, i: true }] }) === '## *a*\\*b'
                && one('Bribe', { b: true, spans: [{ s: 0, e: 2, i: true }] }) === '## ***Br*ibe**' && one('# x - 1. y', { i: true }) === '## *\\# x - 1. y*'
                && [['buy milk', { spans: [{ s: 0, e: 4, b: true }] }], ['ab', { spans: [{ s: 0, e: 1, i: true }, { s: 1, e: 2, b: true }] }], ['a*b', { spans: [{ s: 0, e: 1, i: true }] }], ['Bribe', { b: true, spans: [{ s: 0, e: 2, i: true }] }], ['# x - 1. y', { i: true }], ['a <b>typed</b> &mdash; x', { color: RED, spans: [{ s: 5, e: 10, b: true }] }], ['x_y [z] `q` ~w~', { size: 'small', spans: [{ s: 2, e: 7, color: GREEN, b: true, i: true }] }]]
                    .every(c => JSON.stringify(h2back(one(c[0], c[1]))) === JSON.stringify([c[0], c[1]])), [one('buy milk', { spans: [{ s: 0, e: 4, b: true }] }), one('ab', { spans: [{ s: 0, e: 1, i: true }, { s: 1, e: 2, b: true }] }), one('a*b', { spans: [{ s: 0, e: 1, i: true }] }), one('Bribe', { b: true, spans: [{ s: 0, e: 2, i: true }] }), one('# x - 1. y', { i: true })]);
            check('Markdown round trip (text style): a look that holds for the whole text comes back as the field\'s own — bold on every part is the field\'s bold, one colour on every part the field\'s colour — with the same looks and the same Markdown',
                JSON.stringify(h2back(one('buy milk', { spans: [{ s: 0, e: 4, b: true, color: RED }, { s: 4, e: 8, b: true, color: GREEN }] }))) === JSON.stringify(['buy milk', { b: true, spans: [{ s: 0, e: 4, color: RED }, { s: 4, e: 8, color: GREEN }] }])
                && JSON.stringify(h2back(one('ab', { color: RED, spans: [{ s: 0, e: 2, color: GREEN }] }))) === JSON.stringify(['ab', { color: GREEN }]) && one('ab', { color: RED, spans: [{ s: 0, e: 2, color: GREEN }] }) === one('ab', { color: GREEN }));
            const h2md = (title, fmt) => docToMarkdown({ type: 'doc', id: 'd', meta: { title: 'T' }, blocks: [fmt ? { type: 'h2', title, fmt: { title: fmt } } : { type: 'h2', title }] }, {}).text;
            check('Markdown export (text style): a subtitle that cannot stand on its italic line (it holds a * or a _), a one-line field whose text holds a line break and a hostile format are written as they always were — the plain text',
                h2md('a\nb', { b: true }) === h2md('a\nb') && h2md('a\r\nb', { color: RED }) === h2md('a\r\nb') && h2md('ab', { b: true }) !== h2md('ab') &&
                    docToMarkdown({ type: 'doc', id: 'd', meta: { title: 'T' }, blocks: [{ type: 'h1', title: 'T', sub: 'a_b', fmt: { sub: { color: RED } } }] }, {}).text === docToMarkdown({ type: 'doc', id: 'd', meta: { title: 'T' }, blocks: [{ type: 'h1', title: 'T', sub: 'a_b' }] }, {}).text
                && one('T', { color: 'red;background:url(//evil.example/x)', size: '40px', onclick: 'x', spans: [{ s: 0, e: 9, color: 'url(x)' }] }) === '## T' && one('T', 'bold') === '## T');
            const scene = (title, fmt) => { const md = docToMarkdown({ type: 'planner', id: 'p', meta: { title: 'T' }, blocks: [{ type: 'node', title, tag: '', must: '', fmt: { title: fmt } }] }, {}).text.split('\n')[4], b = markdownToBlocks(md, { kind: 'planner' }).blocks[0]; return [md, b.title, b.fmt && b.fmt.title]; };
            check('Markdown export (text style): a scene node\'s title is checked against the way it is read — after "Scene:" — so one that begins with a space, which that reading would take, is written plain rather than styled and read back unstyled',
                JSON.stringify(scene('The docks', { color: RED })) === JSON.stringify(['### Scene: <span style="color:#d9534f">The docks</span>', 'The docks', { color: RED }]) && JSON.stringify(scene(' x', { b: true })) === JSON.stringify(['### Scene:  x', 'x', undefined]), JSON.stringify([scene('The docks', { color: RED }), scene(' x', { b: true })]));
            const fcOut = (text, fmt) => flowchartToMermaid({ nodes: [{ id: 'a', text, fmt }] }).split('\n')[1];
            check('Markdown export (text style): a styled label whose own text holds the label tags is written with that text escaped inside the styled form (a typed <b> is text there, the styling tags are tags); a label with no format exactly as before',
                fcOut('a <b>x</b>', { color: RED }) === 'a["<font color=d9534f>a #60;b>x#60;/b></font>"]' && fcOut('a <b>x</b>', undefined) === 'a["a <b>x</b>"]' && fcOut('plain "q" #1\nnext', undefined) === 'a["plain #quot;q#quot; #35;1<br>next"]' && fcOut('x', { color: 'red' }) === 'a["x"]' && fcOut('x', { size: 'small' }) === 'a["<small>x</small>"]' && fcOut('x', { size: 'huge', i: true }) === 'a["<big><big><big><i>x</i></big></big></big>"]',
                fcOut('a <b>x</b>', { color: RED }));

            const TFm = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'textfmt.js')).replace(/\\/g, '/'));
            // (4a') a size on a part, underline, strike-through and a link in every kind of plain field (the owner, 2026-10-02)
            {
                const LK = 'https://a.example/x?y=1&z=2', LK2 = 'https://b.example/(p)_q|r', cf = TFm.cleanFmt, Jm = JSON.stringify;
                const stPl2 = { type: 'planner', id: 'plan_m', meta: { title: 'More' }, blocks: [
                    { type: 'h1', title: 'Session two', sub: 'the road', fmt: { title: { spans: [{ s: 0, e: 7, size: 'large', u: true }] }, sub: { spans: [{ s: 4, e: 8, st: true, link: LK }] } } },
                    { type: 'h2', title: 'Beats and bits', fmt: { title: { st: true, spans: [{ s: 0, e: 5, size: 'huge' }, { s: 10, e: 14, link: LK }] } } },
                    { type: 'node', title: 'The docks', tag: 'Stealth', must: 'Who is it?', cols: ['Action', 'Why'], colFmt: [{ u: true }, { spans: [{ s: 0, e: 1, size: 'small' }] }],
                        fmt: { title: { link: LK }, tag: { u: true, st: true }, must: { spans: [{ s: 0, e: 3, size: 'large' }, { s: 4, e: 6, link: LK2 }] } },
                        rows: [{ col1: 'Bribe him', col2: 'fast', fmt: { col1: { spans: [{ s: 0, e: 5, st: true }, { s: 6, e: 9, b: true, link: LK2 }] }, col2: { size: 'large', u: true } } }] },
                    { type: 'flowchart', dir: 'LR', nodes: [{ id: 'a', text: 'one\ntwo\nthree <b>', shape: 'rect', color: 'neutral', fmt: { spans: [{ s: 0, e: 3, size: 'large' }, { s: 4, e: 7, u: true }, { s: 8, e: 13, st: true }] } }, { id: 'b', text: 'done', shape: 'rect', color: 'neutral', fmt: { u: true, st: true } }],
                        edges: [{ from: 'a', to: 'b', text: 'a|b & c', style: 'solid', fmt: { spans: [{ s: 0, e: 1, size: 'small' }] } }] },
                    { type: 'image', src: '', caption: 'the map', fmt: { caption: { spans: [{ s: 4, e: 7, u: true, link: LK }] } } },
                    { type: 'node', mode: 'table', title: 'Loot here', cols: ['Item'], rows: [{ col1: 'gold' }], fmt: { title: { spans: [{ s: 0, e: 4, st: true, link: LK }] } } } ] };
                const md2 = docToMarkdown(stPl2, {}).text, back2 = markdownToBlocks(md2, { kind: 'planner' });
                const want2 = ['---', 'title: More', 'subtitle: the road', '---', '', '# <span style="font-size:1.2em"><u>Session</u></span> two', '*the <a href="https://a.example/x?y=1&amp;z=2"><s>road</s></a>*', '',
                    '## ~~<span style="font-size:1.728em">Beats</span> and [bits](https://a.example/x?y=1&z=2)~~', '', '### Scene: [The docks](https://a.example/x?y=1&z=2)', '**Tag:** ~~<u>Stealth</u>~~', '**Must resolve:** <span style="font-size:1.2em">Who</span> [is](https://b.example/(p)_q|r) it?',
                    '| <u>Action</u> | <span style="font-size:0.833em">W</span>hy |', '|---|---|', '| ~~Bribe~~ <a href="https://b.example/&#40;p&#41;&#95;q&#124;r">**him**</a> | <span style="font-size:1.2em"><u>fast</u></span> |', '',
                    '```flowchart', 'flowchart LR', 'a["<big>one</big><br><u>two</u><br><s>three</s> #60;b>"]', 'b["<s><u>done</u></s>"]', 'a -->|"<small>a</small>#124;b #38; c"| b', '```', '',
                    '![the <a href="https://a.example/x?y=1&amp;z=2"><u>map</u></a>]()', '', '**<a href="https://a.example/x?y=1&amp;z=2"><s>Loot</s></a> here**', '| Item |', '|---|', '| gold |', ''].join('\n');
                check('Markdown export (a size on a part, underline, strike, a link — a planner): every plain field carries them — underline as <u>, strike as ~~ (as <s> inside a line that is itself bold or italic syntax), a link as [text](address) (as <a href> in a cell whose address holds a |, in a caption, in a bold or italic line), a part\'s size as the one span around that part, the whole field\'s look once around everything; a label as the tags mermaid keeps, its own text escaped',
                    md2 === want2, md2);
                check('Markdown round trip (a size on a part, underline, strike, a link — a planner): export then import gives the same blocks — text, formats and structure — and exporting those gives the same Markdown again',
                    canon(strip2(back2.blocks)) === canon(strip2(stPl2.blocks)) && docToMarkdown({ type: 'planner', id: 'plan_m', meta: { title: 'More' }, blocks: back2.blocks }, {}).text === md2 && back2.notes.length === 0, canon(strip2(back2.blocks)) + '\n' + canon(strip2(stPl2.blocks)) + '\n' + Jm(back2.notes));
                check('Markdown export (the same planner with no format): written exactly as it always was', docToMarkdown(unstyle(stPl2), {}).text === ['---', 'title: More', 'subtitle: the road', '---', '', '# Session two', '*the road*', '', '## Beats and bits', '', '### Scene: The docks', '**Tag:** Stealth', '**Must resolve:** Who is it?', '| Action | Why |', '|---|---|', '| Bribe him | fast |', '',
                    '```flowchart', 'flowchart LR', 'a["one<br>two<br>three <b>"]', 'b["done"]', 'a -->|"a|b & c"| b', '```', '', '![the map]()', '', '**Loot here**', '| Item |', '|---|', '| gold |', ''].join('\n'), docToMarkdown(unstyle(stPl2), {}).text);
                const stPg2 = { type: 'doc', id: 'doc_m', meta: { title: 'P' }, blocks: [
                    { id: 'a', type: 'h1', title: 'Rules of play', sub: 'v3 draft', fmt: { title: { link: LK, spans: [{ s: 0, e: 5, size: 'huge' }] }, sub: { u: true, spans: [{ s: 0, e: 2, size: 'small' }] } } },
                    { id: 'b', type: 'h2', title: 'Combat now', cols: 2, fmt: { title: { color: RED, spans: [{ s: 0, e: 6, size: 'large', color: GREEN, u: true }, { s: 7, e: 10, st: true }] } } },
                    { id: 'c', type: 'h3', title: 'Sub part', fmt: { title: { spans: [{ s: 0, e: 3, b: true, i: true, u: true, st: true, size: 'small', color: GREEN, link: LK }] } } },
                    { id: 'e', type: 'table', title: 'Loot table', cols: ['Item', 'Worth | gp'], colFmt: [{ link: LK }, { st: true }], rows: [{ col1: 'buy milk', col2: '2', fmt: { col1: { spans: [{ s: 0, e: 3, size: 'large' }, { s: 4, e: 8, link: LK }] }, col2: { u: true } } }, { col1: 'old', col2: 'x', fmt: { col1: { st: true } } }], fmt: { title: { u: true, spans: [{ s: 5, e: 10, size: 'huge' }] } } },
                    { id: 'f', type: 'image', src: '/saves/images/doc_m/ab12cd34_map.png', caption: 'The map', layout: { width: 33, float: 'left' }, fmt: { caption: { st: true, spans: [{ s: 0, e: 3, size: 'small' }] } } },
                    { id: 'g', type: 'flowchart', dir: 'TD', nodes: [{ id: 'n1', text: 'buy milk\nwalk "dog" #1', shape: 'rect', color: 'gold', fmt: { color: RED, spans: [{ s: 0, e: 8, size: 'larger', u: true }] } }, { id: 'n2', text: 'done & <big>dusted</big>', shape: 'pill', color: 'neutral', fmt: { st: true } }], edges: [{ from: 'n1', to: 'n2', text: 'go', style: 'dotted', fmt: { u: true } }] } ] };
                const mdG2 = docToMarkdown(stPg2, {}).text, backG2 = markdownToBlocks(mdG2, { kind: 'doc' }), again2 = JSON.parse(Jm(backG2.blocks)); again2[4].src = stPg2.blocks[4].src;
                const held2 = cleanDoc(stPg2);
                check('Markdown round trip (a size on a part, underline, strike, a link — a page): export then import gives the same blocks, and the same Markdown on a second export; a page as a player\'s app holds it (rows as lists, their formats beside them) is written the same; the imported page draws exactly as the styled one',
                    canon(stripG(backG2.blocks)) === canon(stripG(JSON.parse(Jm(stPg2.blocks)))) && docToMarkdown({ type: 'doc', id: 'doc_m', meta: { title: 'P' }, blocks: again2 }, {}).text === mdG2 && docToMarkdown(held2, {}).text === mdG2 && backG2.notes.length === 0
                    && renderDoc({ type: 'doc', blocks: again2.map((b, k) => Object.assign({}, b, { id: stPg2.blocks[k].id })) }, { mermaid: false }) === renderDoc(stPg2, { mermaid: false })
                    && (() => { const a = JSON.parse(Jm(backG2.blocks)); a.forEach(cleanBlockFmtsD); return Jm(a) === Jm(backG2.blocks); })(), mdG2 + '\n' + canon(stripG(backG2.blocks)) + '\n' + canon(stripG(JSON.parse(Jm(stPg2.blocks)))));
                check('Markdown export (a size on a part): a part\'s size is the sanitiser\'s span around that part — with its colour in the same span — and never inside another size; one size on every character is written once around everything, as before',
                    one('big and small', { spans: [{ s: 0, e: 3, size: 'huge' }, { s: 8, e: 13, size: 'small', color: RED }] }) === '## <span style="font-size:1.728em">big</span> and <span style="color:#d9534f;font-size:0.833em">small</span>'
                    && one('ab', { size: 'large', spans: [{ s: 0, e: 1, size: 'huge' }] }) === '## <span style="font-size:1.728em">a</span><span style="font-size:1.2em">b</span>' && one('ab', { spans: [{ s: 0, e: 1, size: 'large' }, { s: 1, e: 2, size: 'large', b: true }] }) === '## <span style="font-size:1.2em">a**b**</span>'
                    && [['big and small', { spans: [{ s: 0, e: 3, size: 'huge' }, { s: 8, e: 13, size: 'small', color: RED }] }], ['ab', { size: 'large', spans: [{ s: 0, e: 1, size: 'huge' }] }], ['abc', { color: RED, spans: [{ s: 1, e: 2, size: 'small' }] }]].every(c => Jm(h2back(one(c[0], c[1]))) === Jm([c[0], cf(c[1], c[0])]) && !/font-size[^<]*<span style="[^"]*font-size/.test(one(c[0], c[1]).replace(/<\/span>[\s\S]*$/, ''))),
                    one('big and small', { spans: [{ s: 0, e: 3, size: 'huge' }, { s: 8, e: 13, size: 'small', color: RED }] }) + ' / ' + one('ab', { size: 'large', spans: [{ s: 0, e: 1, size: 'huge' }] }) + ' / ' + one('ab', { spans: [{ s: 0, e: 1, size: 'large' }, { s: 1, e: 2, size: 'large', b: true }] }));
                check('Markdown export (underline, strike): underline is <u>; strike is ~~…~~ where that reads back and <s> where it would not (a struck part that ends in a space, one beside a literal ~); each reads back to the same text and looks',
                    one('ab cd', { spans: [{ s: 0, e: 2, u: true }] }) === '## <u>ab</u> cd' && one('ab cd', { spans: [{ s: 0, e: 2, st: true }] }) === '## ~~ab~~ cd' && one('ab cd', { spans: [{ s: 0, e: 3, st: true }] }) === '## <s>ab </s>cd' && one('ab', { u: true, st: true }) === '## ~~<u>ab</u>~~' && one('5', { st: true }) === '## ~~5~~' && markdownToBlocks('a ~~5~~ b ~~~~ c', { kind: 'doc' }).blocks[0].content === '<p>a <s>5</s> b ~~~~ c</p>' && JSON.stringify(h2back('## x ~~5~~')) === JSON.stringify(['x 5', { spans: [{ s: 2, e: 3, st: true }] }])
                    && [['ab cd', { spans: [{ s: 0, e: 2, u: true }] }], ['ab cd', { spans: [{ s: 0, e: 2, st: true }] }], ['ab cd', { spans: [{ s: 0, e: 3, st: true }] }], ['a~~b~ c', { spans: [{ s: 0, e: 1, st: true }, { s: 5, e: 7, st: true, u: true }] }], ['ab', { u: true, st: true }], ['x_y [z] `q`', { st: true, spans: [{ s: 2, e: 7, u: true, b: true }] }]].every(c => Jm(h2back(one(c[0], c[1]))) === Jm([c[0], cf(c[1], c[0])])),
                    one('ab cd', { spans: [{ s: 0, e: 3, st: true }] }) + ' / ' + one('a~~b~ c', { spans: [{ s: 0, e: 1, st: true }, { s: 5, e: 7, st: true, u: true }] }));
                check('Markdown export (a link): [text](address) where that reads back; <a href="…"> where it would not — an address with an unbalanced bracket, a | in a cell, inside a caption, inside a bold or italic line — the address escaped there, and the characters a line reads for itself written as numeric entities; neighbours of one link share it; each reads back to the same text and looks',
                    one('see the map', { spans: [{ s: 4, e: 11, link: 'https://a.example/' }] }) === '## see [the map](https://a.example/)' && one('ab', { link: 'https://a.example/', spans: [{ s: 0, e: 1, b: true }] }) === '## [**a**b](https://a.example/)'
                    && one('ab', { spans: [{ s: 0, e: 1, link: 'https://a.example/a)b' }] }) === '## <a href="https://a.example/a&#41;b">a</a>b' && one('a', { link: 'https://a.example/?q="x"&<y>w' }) === '## [a](https://a.example/?q="x"&<y>w)' && one('a', { link: 'https://a.example/?q="x"&<y>' }) === '## <a href="https://a.example/?q=&quot;x&quot;&amp;&lt;y&gt;">a</a>' && one('ab', { spans: [{ s: 0, e: 1, st: true, link: 'https://a.example/a)b' }] }) === '## <a href="https://a.example/a&#41;b">~~a~~</a>b'
                    && [['see the map', { spans: [{ s: 4, e: 11, link: 'https://a.example/' }] }], ['ab', { link: 'https://a.example/', spans: [{ s: 0, e: 1, b: true }] }], ['ab', { spans: [{ s: 0, e: 1, link: 'https://a.example/a)b' }] }], ['a', { link: 'https://a.example/?q="x"&<y>' }], ['ab', { spans: [{ s: 0, e: 1, link: 'https://a.example/' }, { s: 1, e: 2, link: 'https://b.example/' }] }],
                        ['[x] (y)', { spans: [{ s: 0, e: 3, link: 'https://a.example/[1]_*~`\\' }] }], ['a b', { link: 'HTTP://A.example/%20&amp;' }]].every(c => Jm(h2back(one(c[0], c[1]))) === Jm([c[0], cf(c[1], c[0])])),
                    one('ab', { spans: [{ s: 0, e: 1, link: 'https://a.example/a)b' }] }) + ' / ' + one('a', { link: 'https://a.example/?q="x"&<y>' }) + ' / ' + one('[x] (y)', { spans: [{ s: 0, e: 3, link: 'https://a.example/[1]_*~`\\' }] }));
                check('Markdown export (hostile): a format whose link is not allowed, or whose size or decoration is none, writes no link and no tag — the plain text, as it always was',
                    ['javascript:alert(1)', 'data:text/html,x', 'https://a b', '//evil.example', 7].every(v => one('T', { link: v, u: 'yes', st: 1, spans: [{ s: 0, e: 1, link: v, size: '99em' }] }) === '## T') && one('T', { b: true, link: 'javascript:alert(1)' }) === '## **T**');
                // import: each form, by hand
                const im2 = markdownToBlocks(['# <u>Under</u> ~~struck~~ <s>too</s> [link](https://a.example/) <a href="https://b.example/">tag</a>', '*a <span style="font-size:1.44em">sub</span>*', '', '## <span style="font-size:1.2em">Big</span> rest', '',
                    '| [A](https://a.example/) | ~~B~~ |', '|---|---|', '| <u>x</u>y | <span style="font-size:0.833em;color:#5cb87a">z</span>w |', '', '![a <u>cap</u>](pic.png)'].join('\n'), { kind: 'doc' }).blocks;
                check('Markdown import (a size on a part, underline, strike, a link): <u>, ~~ and <s>, [text](address) and <a href>, and a size span on a part, in a place that becomes a plain field, are read into its text and its format',
                    im2[0].title === 'Under struck too link tag' && Jm(im2[0].fmt.title) === Jm({ spans: [{ s: 0, e: 5, u: true }, { s: 6, e: 12, st: true }, { s: 13, e: 16, st: true }, { s: 17, e: 21, link: 'https://a.example/' }, { s: 22, e: 25, link: 'https://b.example/' }] })
                    && im2[0].sub === 'a sub' && Jm(im2[0].fmt.sub) === Jm({ spans: [{ s: 2, e: 5, size: 'larger' }] }) && im2[1].title === 'Big rest' && Jm(im2[1].fmt.title) === Jm({ spans: [{ s: 0, e: 3, size: 'large' }] })
                    && Jm(im2[2].cols) === '["A","B"]' && Jm(im2[2].colFmt) === Jm([{ link: 'https://a.example/' }, { st: true }]) && Jm(im2[2].rows) === Jm([{ col1: 'xy', col2: 'zw', fmt: { col1: { spans: [{ s: 0, e: 1, u: true }] }, col2: { spans: [{ s: 0, e: 1, size: 'small', color: GREEN }] } } }])
                    && im2[3].caption === 'a cap' && Jm(im2[3].fmt) === Jm({ caption: { spans: [{ s: 2, e: 5, u: true }] } }), Jm(im2));
                const hostM = markdownToBlocks(['# [T](javascript:alert(1)) <a href="javascript:alert(1)">a</a> <a href="data:text/html,x">b</a> <a href="https://a.example/&#10;x">c</a> <a href="&#106;avascript:alert(1)">d</a> <a href="https://ok.example/" onclick="alert(1)" style="color:red">e</a>', '',
                    '| <a href="//evil.example/x">A</a> | [B](https://a b) |', '|---|---|', '| <a href="https://' + 'a'.repeat(2000) + '">c</a> | <u onclick="x()">d</u><s style="x">e</s> |', '', '![<a href="vbscript:x">cap</a>](p.png)'].join('\n'), { kind: 'doc' }).blocks;
                check('Markdown import (hostile): a link that is not allowed — javascript:, data:, an entity-spelt scheme, a line break in the address, white space inside, an over-long one, a protocol-relative one — is dropped and its text stays; the one allowed link keeps only its address; nothing that runs or calls out is kept',
                    hostM[0].title === 'T a b c d e' && Jm(hostM[0].fmt) === Jm({ title: { spans: [{ s: 10, e: 11, link: 'https://ok.example/' }] } }) && Jm(hostM[1].cols) === '["A","[B](https://a b)"]' && !('colFmt' in hostM[1])
                    && Jm(hostM[1].rows) === Jm([{ col1: 'c', col2: 'de', fmt: { col2: { spans: [{ s: 0, e: 1, u: true }, { s: 1, e: 2, st: true }] } } }]) && hostM[2].caption === 'cap' && !('fmt' in hostM[2])
                    && !/javascript|data:|vbscript|evil|onclick|style=/i.test(Jm(hostM)), Jm(hostM));
                // a label whose own text holds the label tags
                const fc2 = (text, fmt) => flowchartFromMermaid(flowchartToMermaid({ dir: 'TD', nodes: [{ id: 'a', text, shape: 'rect', color: 'neutral', fmt }, { id: 'b', text: 'B', shape: 'rect', color: 'neutral' }], edges: [{ from: 'a', to: 'b', text, style: 'solid', fmt }] }));
                const TAGGED = [['a <b>x</b>', { color: RED }], ['<big>big</big> <small>', { spans: [{ s: 0, e: 5, b: true }] }], ['R&D &amp; &#60; &lt;', { i: true }], ['a]b)c}d|e', { u: true }], ['50% %% done', { st: true }], ['say "hi" #1 #quot; #60; #35;', { spans: [{ s: 4, e: 8, size: 'large' }] }],
                    ['<br> <BR/> <font color=ff0000>x</font> </b>', { b: true }], ['x\ny<i>', { spans: [{ s: 0, e: 1, size: 'huge' }, { s: 2, e: 3, size: 'small' }] }], ['<u>u</u><s>s</s>', { spans: [{ s: 0, e: 3, u: true }, { s: 8, e: 11, st: true }] }]];
                check('Markdown round trip (a styled label whose own text holds the label tags): a typed <b>, <big>, <br>, an ampersand entity, a quote and a #, and the characters the fence reads for structure — ] ) } | & % — are written escaped inside the styled form, so the typed tags are text and the styling tags are tags; the chart reads back as a flowchart with the very text and format, a node\'s label and an arrow\'s alike',
                    TAGGED.every(c => { const fc = fc2(c[0], c[1]); return !!fc && fc.type === 'flowchart' && fc.nodes[0].text === c[0] && Jm(fc.nodes[0].fmt) === Jm(cf(c[1], c[0])) && fc.edges[0].text === c[0] && Jm(fc.edges[0].fmt) === Jm(cf(c[1], c[0])) && flowchartToMermaid(fc) === flowchartToMermaid({ dir: 'TD', nodes: [{ id: 'a', text: c[0], shape: 'rect', color: 'neutral', fmt: c[1] }, { id: 'b', text: 'B', shape: 'rect', color: 'neutral' }], edges: [{ from: 'a', to: 'b', text: c[0], style: 'solid', fmt: c[1] }] }); })
                    && fcOut('a <b>x</b> & "q" #1 ]', { b: true }) === 'a["<b>a #60;b>x#60;/b> #38; #quot;q#quot; #35;1 #93;</b>"]',
                    Jm(TAGGED.map(c => { const fc = fc2(c[0], c[1]); return fc && fc.nodes ? [fc.nodes[0].text, fc.nodes[0].fmt] : flowchartToMermaid({ nodes: [{ id: 'a', text: c[0], fmt: c[1] }] }); }).filter((x, k) => Jm(x) !== Jm([TAGGED[k][0], cf(TAGGED[k][1], TAGGED[k][0])]))));
                check('Markdown export (a label): one with no format is written exactly as before, whatever its text holds; a label\'s format carries no link (none is written); the one text a styled label still cannot carry is a carriage return, which the fence\'s reading drops — that label is written plain',
                    TAGGED.every(c => fcOut(c[0], undefined) === 'a[' + '"' + c[0].replace(/"/g, '#quot;').replace(/#/g, (x, k, s) => s.slice(k, k + 6) === '#quot;' ? x : '#35;').replace(/\n/g, '<br>') + '"]')
                    && fcOut('x', { link: 'https://a.example/' }) === 'a["x"]' && fcOut('xy', { b: true, spans: [{ s: 0, e: 1, link: 'https://a.example/' }] }) === 'a["<b>xy</b>"]' && fcOut('a\rb', { b: true }) === fcOut('a\rb', undefined) && fcOut('a\r\nb', { b: true }) === fcOut('a\r\nb', undefined));
                // (4a'') what the read of the first build found (2026-10-02): a caption that holds a ], a styled label written by hand, an arrow's label with a quote or a #
                {
                    const SRCc = '/saves/images/doc_c/ab12cd34_map.png', capDoc = (caption, fmt, src) => ({ type: 'doc', id: 'doc_c', meta: { title: 'T' }, blocks: [Object.assign({ type: 'image', src: src, caption: caption }, fmt ? { fmt: { caption: fmt } } : {})] });
                    // a picture block out and in again: its line in the file, and whether one picture came back with the very caption and looks, no note, and the same file on a second export
                    const capRT = (caption, fmt, src) => { const md = docToMarkdown(capDoc(caption, fmt, src), {}).text, r = markdownToBlocks(md, { kind: 'doc' }), b = r.blocks[0] || {}, again = JSON.parse(Jm(r.blocks)); if (again[0]) again[0].src = src;
                        return { line: md.split('\n')[4], ok: r.blocks.length === 1 && b.type === 'image' && b.caption === caption && Jm(b.fmt && b.fmt.caption) === Jm(cf(fmt, caption)) && r.notes.length === 0 && docToMarkdown({ type: 'doc', id: 'doc_c', meta: { title: 'T' }, blocks: again }, {}).text === md }; };
                    const c1 = capRT('see [1] here', { b: true }, SRCc), c2 = capRT('map ] key', { spans: [{ s: 0, e: 3, color: RED }] }, SRCc), c3 = capRT('see [1] here', { spans: [{ s: 8, e: 12, u: true, link: LK }] }, SRCc), c4 = capRT('see [1] here', { i: true }, '');
                    const c5 = capRT('see [1] here', undefined, SRCc), c6 = capRT('see [1] here', undefined, ''), c7 = capRT('a ](b', { st: true }, SRCc), c8 = capRT('a ](b', undefined, SRCc), c9 = capRT('C:\\maps\\', { u: true }, SRCc);
                    check('Markdown round trip (a caption that holds a ]): the picture line reads the \\] the export writes, so the caption comes back whole with its looks — bold, a coloured part, a link on a word — with a picture or with none, and writes the same file again; with no format its line is written exactly as before and comes back as the picture it was (no stray text block, no note)',
                        c1.line === '![**see \\[1\\] here**](images/doc_c/map.png)' && c1.ok && c2.line === '![<span style="color:#d9534f">map</span> \\] key](images/doc_c/map.png)' && c2.ok && c3.line === '![see \\[1\\] <a href="https://a.example/x?y=1&amp;z=2"><u>here</u></a>](images/doc_c/map.png)' && c3.ok
                        && c4.line === '![*see \\[1\\] here*]()' && c4.ok && c5.line === '![see \\[1\\] here](images/doc_c/map.png)' && c5.ok && c6.line === '![see \\[1\\] here]()' && c6.ok && c7.ok && c8.line === '![a \\](b](images/doc_c/map.png)' && c8.ok && c9.ok, Jm([c1, c2, c3, c4, c5, c6, c7, c8, c9]));
                    const hw = markdownToBlocks(['![a\\](pic.png)', '', '![see [the map](https://a.example/)](pic2.png)', '', '![plain cap](pic3.png){width=40}', '', 'text ![in \\] line](pic4.png) more'].join('\n'), { kind: 'doc' });
                    check('Markdown import (a picture line written by hand): a caption that ends in a backslash, one that holds a link (read through its paragraph), a plain one and a picture inside a line of text come in as they always did',
                        Jm(hw.blocks.map(b => [b.type, b.caption, b.fmt, b.content])) === Jm([['image', 'a\\', undefined, undefined], ['image', 'see the map', { caption: { spans: [{ s: 4, e: 11, link: 'https://a.example/' }] } }, undefined], ['image', 'plain cap', undefined, undefined], ['text', undefined, undefined, '<p>text  more</p>'], ['image', 'in ] line', undefined, undefined]])
                        && hw.notes.length === 2 && hw.notes.every(x => /inside a paragraph/.test(x)) && hw.images.map(x => x.value).join() === 'pic.png,pic2.png,pic3.png,pic4.png' && hw.blocks[2].layout.width === 40, Jm([hw.blocks, hw.notes, hw.images]));
                    const hand = flowchartFromMermaid(['flowchart TD', 'a["<b>50% off</b>"]', 'b["<b>x|y</b>"]', 'c["<i>50%</i> and <u>5%|6%</u>"]', 'a -->|"<b>50% go</b>"| b'].join('\n')), handMd = hand && flowchartToMermaid(hand), hand2 = handMd && flowchartFromMermaid(handMd);
                    const notOurs = flowchartFromMermaid(['flowchart TD', 'a["<b>a</b><b>b%</b>"]', 'b["<i><b>x|y</b></i>"]', 'c["<b>a<br/>b%</b>"]', 'd["<i>a < b</i>"]', 'e["<u>#1 it</u>"]'].join('\n'));
                    check('Markdown import (a styled label written by hand): its own text may hold a % and, in a node\'s label, a | as they are — the export writes those two as codes — and is still read as that text with its format; the export of what was read reads back the same. A label in any other form than the one the export writes (other tags, another order, a raw < or #) is still its text, tags and all',
                        !!hand && Jm(hand.nodes.map(n => [n.text, n.fmt])) === Jm([['50% off', { b: true }], ['x|y', { b: true }], ['50% and 5%|6%', { spans: [{ s: 0, e: 3, i: true }, { s: 8, e: 13, u: true }] }]]) && Jm(hand.edges.map(e => [e.text, e.fmt])) === Jm([['50% go', { b: true }]])
                        && handMd.split('\n').slice(1).join('\n') === ['a["<b>50#37; off</b>"]', 'b["<b>x#124;y</b>"]', 'c["<i>50#37;</i> and <u>5#37;#124;6#37;</u>"]', 'a -->|"<b>50#37; go</b>"| b'].join('\n') && !!hand2 && Jm(hand2) === Jm(hand) && flowchartToMermaid(hand2) === handMd
                        && !!notOurs && Jm(notOurs.nodes.map(n => [n.text, n.fmt])) === Jm([['<b>a</b><b>b%</b>', undefined], ['<i><b>x|y</b></i>', undefined], ['<b>a\nb%</b>', undefined], ['<i>a < b</i>', undefined], ['<u>#1 it</u>', undefined]]), Jm([hand && hand.nodes, hand && hand.edges, handMd, notOurs && notOurs.nodes]));
                    const arrow = t => { const md = flowchartToMermaid({ dir: 'TD', nodes: [{ id: 'a', text: 'A', shape: 'rect', color: 'neutral' }, { id: 'b', text: 'B', shape: 'rect', color: 'neutral' }], edges: [{ from: 'a', to: 'b', text: t, style: 'solid' }] }), fc = flowchartFromMermaid(md); return [md.split('\n')[3], fc && fc.edges[0].text, !!fc && flowchartToMermaid(fc) === md]; };
                    check('Markdown round trip (an arrow\'s label with no format): a quote and a # are written as the codes every label uses and read back as the characters they are, as a node\'s are — the same text, and the same file on a second export; a label with neither is read exactly as before',
                        Jm(arrow('say "hi" #1')) === Jm(['a -->|"say #quot;hi#quot; #35;1"| b', 'say "hi" #1', true]) && Jm(arrow('go on')) === Jm(['a -->|"go on"| b', 'go on', true]) && Jm(arrow('#35;')) === Jm(['a -->|"#35;35;"| b', '#35;', true])
                        && flowchartFromMermaid('flowchart TD\na -- say #quot;hi#quot; --> b').edges[0].text === 'say "hi"' && flowchartFromMermaid('flowchart TD\na -. no #35;1 .-> b').edges[0].text === 'no #1', Jm([arrow('say "hi" #1'), arrow('go on'), arrow('#35;')]));
                }
            }
            // (4b) seeded: a random format on a random text — marks, pipes, brackets, quotes, an ampersand, white space at the ends — in every kind of plain field
            {
                let a = 20261002; const Rn = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
                const COL = [RED, GREEN, '#4db3d3'], ALPHA = 'ab c*_|#<>&[]\\`~"\'-+.1:{}()!', pick = l => l[Math.floor(Rn() * l.length)], LINKS = ['https://a.example/', 'https://b.example/x?y=1&z=2#f', 'https://c.example/(p)_q|r*s~[t]', 'HTTP://D.example/"q"<r>'], had = {};
                const cleanF = TFm.cleanFmt, looks = (t, f) => { const c = cleanF(f, t); return JSON.stringify([(c && c.size) || '', TFm.runsOf(t, c)]); };
                const kinds = ['h1', 'sub', 'h2', 'h3', 'caption', 'ttitle', 'head', 'cell', 'stitle', 'tag', 'must', 'label', 'edge'], seen = {};
                let n = 0, kept = 0, plainN = 0, trimmed = 0, lost = 0, bad = null;
                for (let it = 0; it < 2600 && !bad; it++) {
                    const kind = pick(kinds), planner = kind === 'stitle' || kind === 'tag' || kind === 'must' || (kind !== 'h3' && Rn() < 0.3), kd = planner ? 'planner' : 'doc';
                    let t = Array.from({ length: 1 + Math.floor(Rn() * 13) }, () => pick(ALPHA)).join(''); if (kind === 'label' && Rn() < 0.4) t = t.replace(/ /g, '\n');
                    const fAll = cleanF({ size: Rn() < 0.2 ? pick(['small', 'large', 'larger', 'huge']) : undefined, color: Rn() < 0.3 ? pick(COL) : undefined, b: Rn() < 0.15 ? true : undefined, i: Rn() < 0.15 ? true : undefined, u: Rn() < 0.12 ? true : undefined, st: Rn() < 0.12 ? true : undefined, link: Rn() < 0.1 ? pick(LINKS) : undefined,
                        spans: Array.from({ length: Math.floor(Rn() * 4) }, () => { const s = Math.floor(Rn() * t.length); return { s, e: s + 1 + Math.floor(Rn() * 5), color: Rn() < 0.5 ? pick(COL) : undefined, b: Rn() < 0.4 ? true : undefined, i: Rn() < 0.4 ? true : undefined, u: Rn() < 0.25 ? true : undefined, st: Rn() < 0.25 ? true : undefined, size: Rn() < 0.25 ? pick(['small', 'large', 'larger', 'huge']) : undefined, link: Rn() < 0.25 ? pick(LINKS) : undefined }; }) }, t);
                    const f = kind === 'label' || kind === 'edge' ? D.labelFmt(fAll, t) : fAll;   // a label holds no link
                    if (f) ['u', 'st', 'size', 'link'].forEach(kk => { if (f[kk] || (f.spans || []).some(sp => sp[kk])) had[kk] = (had[kk] || 0) + 1; });
                    if (!f) continue;
                    const mk = fm => {   // a document holding the field, with or without its format
                        const B = [{ type: 'h1', title: 'T', sub: 'S' }], put = (b, k) => { if (fm) (b.fmt = b.fmt || {})[k] = fm; };
                        if (kind === 'h1') { B[0].title = t; put(B[0], 'title'); } else if (kind === 'sub') { B[0].sub = t; put(B[0], 'sub'); }
                        else if (kind === 'h2' || kind === 'h3') { const b = { type: kind, title: t }; put(b, 'title'); B.push(b); }
                        else if (kind === 'caption') { const b = { type: 'image', src: '', caption: t }; put(b, 'caption'); B.push(b); }
                        else if (kind === 'ttitle' || kind === 'head' || kind === 'cell') {
                            const b = planner ? { type: 'node', mode: 'table', title: 'Tt', cols: ['A', 'B'], rows: [{ col1: 'x', col2: 'y' }] } : { type: 'table', title: 'Tt', cols: ['A', 'B'], rows: [{ col1: 'x', col2: 'y' }] };
                            if (kind === 'ttitle') { b.title = t; put(b, 'title'); } else if (kind === 'head') { b.cols[1] = t; if (fm) b.colFmt = [null, fm]; } else { b.rows[0].col1 = t; if (fm) b.rows[0].fmt = { col1: fm }; }
                            B.push(b);
                        } else if (kind === 'stitle' || kind === 'tag' || kind === 'must') { const b = { type: 'node', title: 'Sc', tag: 'tg', must: 'ms', cols: ['A'], rows: [{ col1: 'x' }] }, k = kind === 'stitle' ? 'title' : kind; b[k] = t; put(b, k); B.push(b); }
                        else { const b = { type: 'flowchart', dir: 'TD', nodes: [{ id: 'a', text: 'A', shape: 'rect', color: 'neutral' }, { id: 'b', text: 'B', shape: 'rect', color: 'neutral' }], edges: [{ from: 'a', to: 'b', text: 'e', style: 'solid' }] };
                            if (kind === 'label') { b.nodes[0].text = t; if (fm) b.nodes[0].fmt = fm; } else { b.edges[0].text = t; if (fm) b.edges[0].fmt = fm; } B.push(b); }
                        return { type: kd, id: 'x', meta: { title: 'M' }, blocks: B };
                    };
                    const get = bs => {   // the field as it was read back
                        const b1 = bs[1] || {}; let tx, fm;
                        if (kind === 'h1') { tx = bs[0].title; fm = bs[0].fmt && bs[0].fmt.title; } else if (kind === 'sub') { tx = bs[0].sub; fm = bs[0].fmt && bs[0].fmt.sub; }
                        else if (kind === 'h2' || kind === 'h3' || kind === 'ttitle' || kind === 'stitle') { tx = b1.title; fm = b1.fmt && b1.fmt.title; }
                        else if (kind === 'caption') { tx = b1.caption; fm = b1.fmt && b1.fmt.caption; } else if (kind === 'tag' || kind === 'must') { tx = b1[kind]; fm = b1.fmt && b1.fmt[kind]; }
                        else if (kind === 'head') { tx = (b1.cols || [])[1]; fm = (b1.colFmt || [])[1]; } else if (kind === 'cell') { const r = (b1.rows || [])[0] || {}; tx = r.col1; fm = r.fmt && r.fmt.col1; }
                        else if (kind === 'label') { const nd = (b1.nodes || [])[0] || {}; tx = nd.text; fm = nd.fmt; } else { const e = (b1.edges || [])[0] || {}; tx = e.text; fm = e.fmt; }
                        return { tx, fm: fm || undefined, types: bs.map(b => b.type).join(',') };
                    };
                    const mdP = docToMarkdown(mk(null), {}).text, mdF = docToMarkdown(mk(f), {}).text, read = markdownToBlocks(mdF, { kind: kd }).blocks, bP = get(markdownToBlocks(mdP, { kind: kd }).blocks), bF = get(read);
                    const want = mk(null).blocks.map(b => b.type).join(','), core = x => String(x).replace(/\n/g, ' ').replace(/[\s#]+$/, '').trim(), say = why => { bad = { why, kind, kd, t, f, mdF, bF }; };
                    n++;
                    if (bP.types === want && bF.types !== want) { say('the structure broke'); continue; }
                    if (bF.types !== want) { lost++; continue; }   // a structure the dialect loses with or without a format (a label beyond the flowchart subset)
                    if (bF.tx !== t && bF.tx !== bP.tx && core(bF.tx) !== core(t)) { say('another text'); continue; }
                    if (mdF === mdP) { plainN++; if (bP.fm === undefined && bF.fm !== undefined) say('a format from a plain file'); continue; }
                    if (bF.fm === undefined) { say('a styled file read plain'); continue; }
                    if (bF.tx !== t) { trimmed++; continue; }   // white space at the field's ends, or a heading's closing #, is the dialect's to trim
                    if (looks(bF.tx, bF.fm) !== looks(t, f)) { say('other looks'); continue; }
                    if (docToMarkdown({ type: kd, id: 'x', meta: { title: 'M' }, blocks: read }, {}).text !== mdF) { say('the second export differs'); continue; }
                    kept++; seen[kind] = (seen[kind] || 0) + 1;
                }
                check('Markdown round trip (text style, seeded: ' + n + ' styled fields of every kind — colour, bold, italic, underline, strike, a size and a link on the field or on parts of it — their texts full of marks, pipes, brackets and quotes): the structure never breaks; the text is the true text (or the plain file\'s, or trimmed at its ends); a field written with its format reads back with exactly its looks (' + kept + ' times) and writes the same file again; one that could not be is written plain (' + plainN + ' times) — never another look',
                    !bad && n > 2000 && kept > 1500 && plainN > 0 && kinds.every(k => seen[k] > 40) && ['u', 'st', 'size', 'link'].every(kk => had[kk] > 300), bad ? JSON.stringify(bad) : JSON.stringify({ n, kept, plainN, trimmed, lost, seen, had }));
            }

            // (5) the import of each form, and of hostile ones
            const { fmtFromInline } = M;
            check('fmtFromInline: text and format from inline HTML, read only from what the page sanitiser writes — b / strong, i / em, u, s / strike, a link, the one span (a colour, a size: around everything or around a part); code, a paragraph and a line break are their text; the result is the cleaner\'s',
                JSON.stringify(fmtFromInline('a <b>b</b> <i>c</i>')) === JSON.stringify({ text: 'a b c', fmt: { spans: [{ s: 2, e: 3, b: true }, { s: 4, e: 5, i: true }] } })
                && JSON.stringify(fmtFromInline('<strong>x</strong><em>y</em>').fmt) === JSON.stringify({ spans: [{ s: 0, e: 1, b: true }, { s: 1, e: 2, i: true }] })
                && JSON.stringify(fmtFromInline('<span style="color: rgb(217, 83, 79); font-size: 1.2em">all <font color="#5CB87A">g</font></span>')) === JSON.stringify({ text: 'all g', fmt: { size: 'large', color: RED, spans: [{ s: 4, e: 5, color: GREEN }] } })
                && JSON.stringify(fmtFromInline('a &amp; &lt;b&gt; <u>u</u> <a href="https://a.b/c?x=1&amp;y=&quot;2&quot;">l</a><br>x <strike>s</strike><s>t</s> <code>c</code>')) === JSON.stringify({ text: 'a & <b> u lx st c', fmt: { spans: [{ s: 8, e: 9, u: true }, { s: 10, e: 11, link: 'https://a.b/c?x=1&y="2"' }, { s: 13, e: 15, st: true }] } })
                && JSON.stringify(fmtFromInline('')) === JSON.stringify({ text: '' }) && JSON.stringify(fmtFromInline(null)) === JSON.stringify({ text: '' })
                && JSON.stringify(fmtFromInline('<b><i>x</i></b>').fmt) === JSON.stringify({ b: true, i: true }) && JSON.stringify(fmtFromInline('<u><s><a href="https://a.b/">x</a></s></u>').fmt) === JSON.stringify({ u: true, st: true, link: 'https://a.b/' })
                && JSON.stringify(fmtFromInline('a<span style="font-size:1.2em">b</span>')) === JSON.stringify({ text: 'ab', fmt: { spans: [{ s: 1, e: 2, size: 'large' }] } })
                && JSON.stringify(fmtFromInline('<span style="font-size:1.2em">a<span style="font-size:1.728em;color:#5cb87a">b</span></span>').fmt) === JSON.stringify({ size: 'large', spans: [{ s: 1, e: 2, color: GREEN }] })
                && JSON.stringify(fmtFromInline('<a href="javascript:alert(1)">x</a><a href="https://a b">y</a>')) === JSON.stringify({ text: 'xy' }), JSON.stringify(fmtFromInline('a &amp; &lt;b&gt; <u>u</u> <a href="https://a.b/c?x=1&amp;y=&quot;2&quot;">l</a><br>x <strike>s</strike><s>t</s> <code>c</code>')));
            check('fmtFromInline: hostile inline HTML gives only what the sanitiser lets through — a colour or a size that is not the strict form is dropped while the text stays, a handler and every other property are gone, a script is dropped with its content',
                JSON.stringify(fmtFromInline('<span style="color:red;background:url(//evil.example/x)" onclick="x()">a</span><span style="color:#00ff00;position:fixed" onmouseover=alert(1)>b</span><span style="font-size:40px">c</span><script>alert(1)</script><span style="color:expression(alert(1))">d</span>'))
                    === JSON.stringify({ text: 'abcd', fmt: { spans: [{ s: 1, e: 2, color: '#00ff00' }] } })
                && JSON.stringify(fmtFromInline('<img src=x onerror=alert(1)><b onclick="x">B</b><style>*{}</style>')) === JSON.stringify({ text: 'B', fmt: { b: true } })
                && (() => { const many = fmtFromInline(Array.from({ length: 900 }, (_, k) => k % 2 ? 'x' : '<b>y</b>').join('')); return many.text.length === 900 && many.fmt.spans.length === 200 && risksNone(JSON.stringify(many)); })());
            const imp = markdownToBlocks(['# **Big** <span style="color:#5cb87a">title</span>', '*a <b>sub</b>*', '', '## <span style="color:#d9534f;font-size:1.44em">Sec</span> {cols=2}', '', '### *Sub*', '', '**<span style="font-size:0.833em">Tab</span>**', '| **A** | B |', '|---|---|', '| <font color="#5cb87a">x</font>y | _z_ |', '',
                '![a *cap*](pic.png)', '', '```flowchart', 'flowchart LR', 'a["<font color=5cb87a>go</font> on"] -->|"<b>yes</b>"| b["<i><b>not ours</b></i>"]', 'b --> c["<big>part</big> big"]', '```', '', 'Text <span style="color:#d9534f">red</span> and <span style="font-size:1.2em">large</span>.', '', '::: flare', '<span style="color:#5cb87a">g</span>o', ':::', '', '> <font color="#d9534f">q</font>uote'].join('\n'), { kind: 'doc' });
            const ib = imp.blocks;
            check('Markdown import (text style): **, *, _ and the span form in a place that becomes a plain field are read into its text and its format — a title, the italic line under it, a section (its {cols} still read), a sub-heading, a table\'s bold title line, its heads and cells, a caption',
                types(imp) === 'h1,h2,h3,table,image,flowchart,text,flare,callout' && ib[0].title === 'Big title' && JSON.stringify(ib[0].fmt) === JSON.stringify({ title: { spans: [{ s: 0, e: 3, b: true }, { s: 4, e: 9, color: GREEN }] }, sub: { spans: [{ s: 2, e: 5, b: true }] } }) && ib[0].sub === 'a sub'
                && ib[1].title === 'Sec' && ib[1].cols === 2 && JSON.stringify(ib[1].fmt) === JSON.stringify({ title: { size: 'larger', color: RED } }) && ib[2].title === 'Sub' && JSON.stringify(ib[2].fmt) === JSON.stringify({ title: { i: true } })
                && ib[3].title === 'Tab' && JSON.stringify(ib[3].fmt) === JSON.stringify({ title: { size: 'small' } }) && JSON.stringify(ib[3].cols) === '["A","B"]' && JSON.stringify(ib[3].colFmt) === '[{"b":true}]' && JSON.stringify(ib[3].rows) === JSON.stringify([{ col1: 'xy', col2: 'z', fmt: { col1: { spans: [{ s: 0, e: 1, color: GREEN }] }, col2: { i: true } } }])
                && ib[4].caption === 'a cap' && JSON.stringify(ib[4].fmt) === JSON.stringify({ caption: { spans: [{ s: 2, e: 5, i: true }] } }), JSON.stringify(ib.slice(0, 5)));
            const fmSub = markdownToBlocks('---\nsubtitle: From the front matter\n---\n# T\n*<b>another</b> line*', { kind: 'doc' }).blocks[0], lineSub = markdownToBlocks('---\nsubtitle: a sub\n---\n# T\n*a <b>sub</b>*', { kind: 'doc' }).blocks[0];
            check('Markdown import (text style): the italic line under the title gives the subtitle its format only where it is the subtitle — a front matter subtitle of another text keeps its text and takes no format',
                fmSub.sub === 'From the front matter' && !('fmt' in fmSub) && lineSub.sub === 'a sub' && JSON.stringify(lineSub.fmt) === JSON.stringify({ sub: { spans: [{ s: 2, e: 5, b: true }] } }), JSON.stringify([fmSub, lineSub]));
            check('Markdown import (text style): a flowchart label is read into text and format only in the very form the export writes (b, i, u, s, font color=rrggbb, big / small around everything or around a part); any other label is its text, tags and all, as before',
                JSON.stringify(ib[5].nodes.map(n => [n.text, n.fmt])) === JSON.stringify([['go on', { spans: [{ s: 0, e: 2, color: GREEN }] }], ['<i><b>not ours</b></i>', undefined], ['part big', { spans: [{ s: 0, e: 4, size: 'large' }] }]]) && JSON.stringify(ib[5].edges.map(e => [e.text, e.fmt])) === JSON.stringify([['yes', { b: true }], ['', undefined]])
                && [['<u>x</u> <s>y</s>', 'x y', { spans: [{ s: 0, e: 1, u: true }, { s: 2, e: 3, st: true }] }], ['<big><big>x</big></big>y<small>z</small>', 'xyz', { spans: [{ s: 0, e: 1, size: 'larger' }, { s: 2, e: 3, size: 'small' }] }], ['<big>x</big>', 'x', { size: 'large' }],
                    ['<big><small>x</small></big>y', '<big><small>x</small></big>y', undefined], ['<big><big><big><big>x</big></big></big></big>y', '<big><big><big><big>x</big></big></big></big>y', undefined], ['<big>x</big><big>y</big>', '<big>x</big><big>y</big>', undefined], ['<U>x</U>', '<U>x</U>', undefined], ['<a href=x>y</a>', '<a href=x>y</a>', undefined], ['<b>a < b</b>', '<b>a < b</b>', undefined]]
                    .every(c => { const nd = flowchartFromMermaid('flowchart TD\na["' + c[0] + '"]').nodes[0]; return nd.text === c[1] && JSON.stringify(nd.fmt) === JSON.stringify(c[2]); }), JSON.stringify(ib[5]));
            check('Markdown import (text style): in a place that becomes a text block the span form is kept as the sanitiser gives it (a paragraph, a fenced prose block, a quote; <font color> becomes the span)',
                ib[6].content === '<p>Text <span style="color:#d9534f">red</span> and <span style="font-size:1.2em">large</span>.</p>' && ib[7].content === '<span style="color:#5cb87a">g</span>o' && ib[8].content === '<span style="color:#d9534f">q</span>uote', JSON.stringify(ib.slice(6)));
            const hostile = markdownToBlocks(['# <span style="color:red;background:url(//evil.example/x)" onclick="x()">T</span><script>alert(1)</script>', '', '## <span style="color:#00ff00;position:fixed;top:0" onmouseover="alert(1)">S</span> <span style="font-size:99em">big</span>', '',
                '| <b onclick="x()">A</b> | <span style="color:#abcdef&quot; onmouseover=&quot;alert(1)">B</span> |', '|---|---|', '| <img src=x onerror=alert(1)>c | <a href="javascript:alert(1)">d</a> |', '', '![<span style="color:url(x)">cap</span>](p.png)', '',
                'P <span style="color:#00ff00;background:url(x)" onclick="x()">g</span> <span style="font-size:300px">h</span><iframe src="//evil.example"></iframe>', '', '### <b>B</b><script>x</script>y'].join('\n'), { kind: 'doc' });
            const hb = hostile.blocks;
            check('Markdown import (text style, hostile): only what the sanitiser lets through becomes a format or stays in a text block — a colour or size that is not the strict form is dropped while the text stays, every handler, property and URL is gone, and a field whose text the sanitiser reads differently takes no format at all',
                hb[0].title === 'Talert(1)' && !('fmt' in hb[0]) && hb[1].title === 'S big' && JSON.stringify(hb[1].fmt) === JSON.stringify({ title: { spans: [{ s: 0, e: 1, color: '#00ff00' }] } })
                && JSON.stringify(hb[2].cols) === '["A","B"]' && JSON.stringify(hb[2].colFmt) === '[{"b":true}]' && JSON.stringify(hb[2].rows) === '[{"col1":"c","col2":"d"}]' && hb[3].caption === 'cap' && !('fmt' in hb[3])
                && hb[4].content === '<p>P <span style="color:#00ff00">g</span> h</p>' && hb[5].type === 'h3' && hb[5].title === 'Bxy' && !('fmt' in hb[5]) && risksNone(JSON.stringify(hb)) && !/onclick|onmouseover|onerror|url\(|evil|javascript|position|iframe/.test(JSON.stringify(hb)), JSON.stringify(hb));
            check('Markdown export (text style, a text block): a colour or size span is written as the sanitiser\'s one form; one that runs across paragraphs is closed and opened again in each; one inside code is dropped; and the block reads back the same',
                htmlToMarkdown(sanitizeHtml('<p><font color="#D9534F">red</font> <b><span style="font-size: 1.2em; color: rgb(92, 184, 122)">both</span></b></p>')) === '<span style="color:#d9534f">red</span> **<span style="color:#5cb87a;font-size:1.2em">both</span>**'
                && htmlToMarkdown(sanitizeHtml('<span style="color:#d9534f"><p>one</p><p>two</p></span>')) === '<span style="color:#d9534f">one</span>\n\n<span style="color:#d9534f">two</span>'
                && htmlToMarkdown(sanitizeHtml('<ul><li><span style="color:#5cb87a">done</span></li><li>todo</li></ul>')) === '- <span style="color:#5cb87a">done</span>\n- todo'
                && htmlToMarkdown('<p><code><span style="color:#d9534f">x</span></code> <span style="color:#d9534f"></span><span style="color:red" onclick="x">y</span></p>') === '`x` y'
                && ['<p><span style="color:#d9534f">red</span> <b><span style="color:#5cb87a;font-size:1.2em">both</span></b></p>', '<p><span style="color:#d9534f">one</span></p><p><span style="color:#d9534f">two</span></p>', '<ul><li><span style="color:#5cb87a">done</span></li><li>todo</li></ul>', '<p>a <span style="font-size:0.833em">- small</span><br>b</p>']
                    .every(h => markdownToBlocks(docToMarkdown({ type: 'doc', id: 'd', meta: { title: 'T' }, blocks: [{ type: 'text', content: h }] }, {}).text, { kind: 'doc' }).blocks[0].content === h), htmlToMarkdown(sanitizeHtml('<span style="color:#d9534f"><p>one</p><p>two</p></span>')));
            {   // beside a span's tag Markdown's own marks can pair up wrongly on the way back in: the block is read back before it is written
                const C = '<span style="color:#d9534f">', E = '</span>', mdOf = (h, type) => docToMarkdown({ type: 'doc', id: 'd', meta: { title: 'T' }, blocks: [{ type: type || 'text', content: h }] }, {}).text, bodyOf = t => t.slice(t.indexOf('\n---\n\n') + 6);
                const backOf = (h, type) => markdownToBlocks(mdOf(h, type), { kind: 'doc' }).blocks.map(b => b.type + ':' + b.content).join('|');
                const garbled = ['<p>x <i>' + C + '<b>w</b>' + E + '</i> y <b>z</b></p>', '<p><i>' + C + 'a <b>w</b>' + E + '</i></p>'];
                // I, a colour and B pressed on one word, in each of their six orders
                const orders = ['<p>x <i><b>' + C + 'w' + E + '</b></i> y <b>z</b></p>', '<p>x <b><i>' + C + 'w' + E + '</i></b> y <b>z</b></p>', '<p>x <i>' + C + '<b>w</b>' + E + '</i> y <b>z</b></p>', '<p>x <b>' + C + '<i>w</i>' + E + '</b> y <b>z</b></p>', '<p>x ' + C + '<i><b>w</b></i>' + E + ' y <b>z</b></p>', '<p>x ' + C + '<b><i>w</i></b>' + E + ' y <b>z</b></p>'];
                check('Markdown round trip (text style, a text block): an italic around a coloured part that starts bold, and I, a colour and B pressed on one word in each of their six orders, come back as the very block — no stray mark, no bold running on into the rest of the paragraph',
                    garbled.concat(orders).every(h => backOf(h) === 'text:' + h) && backOf('<i>' + C + 'a <b>w</b>' + E + '</i> then <b>z</b>', 'callout') === 'callout:<i>' + C + 'a <b>w</b>' + E + '</i> then <b>z</b>', garbled.concat(orders).map(h => backOf(h)).filter((b, k) => b !== 'text:' + garbled.concat(orders)[k]).join(' / '));
                check('Markdown export (text style, a text block): beside a span the marks are used only where they read back as the tags do — else the block\'s bold and italic are written as <b> / <i>; inside code nothing changes; a block with no span is checked the same way: its marks where they read back, exactly as it always was, and the tags where they would not (a bold part inside an italic)',
                    bodyOf(mdOf(garbled[0])) === 'x <i>' + C + '<b>w</b>' + E + '</i> y <b>z</b>\n' && bodyOf(mdOf(orders[3])) === 'x **' + C + '*w*' + E + '** y **z**\n' && bodyOf(mdOf(orders[5])) === 'x ' + C + '***w***' + E + ' y **z**\n'
                    && bodyOf(mdOf('<i>' + C + 'a <b>w</b>' + E + '</i>', 'lede')) === '> [!lede] <i>' + C + 'a <b>w</b>' + E + '</i>\n'
                    && htmlToMarkdown('<p><i>' + C + 'a <b>w</b>' + E + '</i> <code>c</code> <s>s</s></p>', { tags: true }) === '<i>' + C + 'a <b>w</b>' + E + '</i> `c` <s>s</s>' && htmlToMarkdown('<p><i>a</i> <b>b</b></p>', { tags: false }) === '*a* **b**' && htmlToMarkdown('<p><i>a</i> <b>b</b></p>', 1) === '*a* **b**'
                    && htmlToMarkdown('<p><code><b>x <code>y</code></b> z</code> <b><i>w</i></b></p>', { tags: true }) === htmlToMarkdown('<p><code><b>x <code>y</code></b> z</code> </p>') + ' <b><i>w</i></b>'   // one opened inside code closes as the mark it was
                    && bodyOf(mdOf('<p><i>a <b>w</b></i></p>')) === '<i>a <b>w</b></i>\n' && bodyOf(mdOf('<p>x <i><b>w</b></i> y <b>z</b></p>')) === 'x ***w*** y **z**\n' && bodyOf(mdOf('<p>a <b>bold</b> and <i>it</i></p>')) === 'a **bold** and *it*\n', [bodyOf(mdOf(garbled[0])), bodyOf(mdOf(orders[3])), bodyOf(mdOf('<i>' + C + 'a <b>w</b>' + E + '</i>', 'lede'))]);
                // a seeded walk: nested i / b / span content, in paragraphs and in a list, the words full of marks
                let a = 90210; const R = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
                const pick = l => l[Math.floor(R() * l.length)], WORDS = ['a', 'w', 'the fort', 'x*y', 'two words', '_u_', '1.', 'red', '**', 'a ', ' b', '&', '<', 'it\'s'];
                const SPANS = ['<span style="color:#d9534f">', '<span style="color:#5cb87a">', '<span style="font-size:1.2em">', '<span style="color:#4db3d3;font-size:0.833em">'];
                const gen = depth => { let s = ''; const n = 1 + Math.floor(R() * 3);
                    for (let k = 0; k < n; k++) { const r = R();
                        if (depth > 2 || r < 0.55) s += pick(WORDS).replace(/&/g, '&amp;').replace(/</g, '&lt;') + (R() < 0.5 ? ' ' : '');
                        else if (r < 0.7) s += '<i>' + gen(depth + 1) + '</i>'; else if (r < 0.85) s += '<b>' + gen(depth + 1) + '</b>'; else s += pick(SPANS) + gen(depth + 1) + '</span>'; }
                    return s; };
                // the look of every visible character: bold, italic, the colour and the size that reach it
                const looks = html => { const out = [], st = []; let m; const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/g;
                    while ((m = re.exec(html))) {
                        if (m[4] !== undefined) { const col = st.map(t => /color:(#[0-9a-f]{6})/.exec(t)).filter(Boolean).pop(), siz = st.map(t => /font-size:([0-9.]+em)/.exec(t)).filter(Boolean).map(x => x[1]).join('*');
                            const lk = (st.indexOf('b') >= 0 ? 'B' : '') + (st.indexOf('i') >= 0 ? 'I' : '') + (col ? col[1] : '') + siz;
                            m[4].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, '').split('').forEach(ch => out.push(ch + lk)); continue; }
                        if (m[2] === 'p' || m[2] === 'ul' || m[2] === 'li' || m[2] === 'br') { if (!m[1] || m[2] === 'br') out.push('<' + m[2] + '>'); continue; }
                        if (m[1]) st.pop(); else st.push(m[2] === 'span' ? m[3] : m[2]); }
                    return out.join(' '); };
                let bad = null, n = 0, tagged = 0, marked = 0, twice = 0, saved = 0;
                for (let k = 0; k < 4000 && !bad; k++) {
                    const shape = R(), raw = shape < 0.7 ? '<p>' + gen(0) + '</p>' + (R() < 0.3 ? '<p>' + gen(0) + '</p>' : '') : shape < 0.85 ? '<ul><li>' + gen(0) + '</li><li>' + gen(0) + '</li></ul>' : gen(0), type = shape < 0.85 ? 'text' : 'callout';
                    const h = sanitizeHtml(raw); if (h.indexOf('<span') < 0 || !h.replace(/<[^>]+>/g, '').trim()) continue;
                    const md = mdOf(h, type), back = markdownToBlocks(md, { kind: 'doc' }).blocks;
                    n++; if (/<[bi]>/.test(md)) tagged++; else if (/\*/.test(md.replace(/\\\*/g, ''))) marked++;
                    if (type === 'text') { const mk = markdownToBlocks(htmlToMarkdown(h), { kind: 'doc' }).blocks, wrong = mk.length !== 1 || looks(mk[0].content) !== looks(h);   // the marks alone, as they were written before
                        if (wrong) { saved++; if (!/<[bi]>/.test(md)) { bad = { h, md, why: 'the marks were kept though they read back wrong' }; break; } } }
                    if (back.length !== 1 || back[0].type !== type) { bad = { h, md, back: back.map(b => b.type), why: 'blocks' }; break; }
                    if (looks(back[0].content) !== looks(h)) { bad = { h, md, back: back[0].content, why: 'looks' }; break; }
                    if (inert(back[0].content) !== null) { bad = { h, md, back: back[0].content, why: inert(back[0].content) }; break; }
                    const md2 = mdOf(back[0].content, type); if (md2 === md) twice++; else if (looks(markdownToBlocks(md2, { kind: 'doc' }).blocks[0].content) !== looks(h)) { bad = { h, md, md2, why: 'second export' }; break; }
                }
                check('Markdown round trip (text style, seeded: ' + n + ' text and prose blocks of nested bold, italic, colour and size, their words full of marks): every visible character comes back with its look — bold, italic, colour, size — in one block of the same type, inert; ' + tagged + ' of them are written with <b> / <i> (' + saved + ' text blocks would have come back garbled with the marks), ' + marked + ' kept the marks',
                    !bad && n > 1500 && tagged > 1000 && saved > 900 && marked > 100 && twice > n * 0.9, JSON.stringify(bad || { n, tagged, marked, twice, saved }));
            }
            check('Markdown import (text style): a span that holds nothing — opened on a line of its own, closed on a later one, left open at the end, nested in another — leaves no empty paragraph and no empty span behind (a span lives inside one paragraph); a coloured space keeps its space, a span with text is kept',
                (() => { const cont = (t, kind) => markdownToBlocks(t, { kind: kind || 'doc' }).blocks.map(b => b.type + ':' + b.content).join('|'), S = '<span style="color:#ff0000">';
                    return cont(S + '\n\npara\n\n</span>') === 'text:<p>para</p>' && cont('x\n\n' + S) === 'text:<p>x</p>' && cont(S + '\n\npara\n\n</span>', 'planner') === 'text:<p>para</p>'
                        && cont('a' + S + ' </span>b\n\n' + S + '<span style="font-size:1.2em"></span></span>\n\n' + S + 'c</span>') === 'text:<p>a b</p><p>' + S + 'c</span></p>'
                        && cont('> ' + S + '</span>q' + S) === 'callout:q' && cont('::: lede\n' + S + '</span>l ' + S + 'm</span>\n:::') === 'lede:l ' + S + 'm</span>' && cont(S) === ''; })(),
                JSON.stringify(markdownToBlocks('<span style="color:#ff0000">\n\npara\n\n</span>', { kind: 'doc' }).blocks.map(b => b.content)));
            const guide = require('fs').readFileSync(path.join(__dirname, '..', 'CAMPAIGN_INTEGRATION.md'), 'utf8').replace(/\r\n/g, '\n'), ixH = require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8').replace(/\r\n/g, '\n').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
            check('said (the integration guide and Help): Markdown carries text style — how it is written, what is read back, and exactly what is not carried',
                guide.indexOf('**Text style in Markdown:**') > 0 && ['bold as `**…**`, italic as `*…*`, strike-through as `~~…~~`, a link as `[text](address)`', '`<span style="color:#rrggbb">`', 'as `<b>` / `<i>` / `<s>` / `<a href="…">` instead', 'underline as `<u>`', 'a colour and a size as that span around the part that has it', '`<font color=rrggbb>`', '`<b>`, `<i>`, `<u>`, `<s>`, `<font color=rrggbb>`', 'around everything where the label has one size, around a part where its parts differ', '`#60;` for `<`, `#38;` for `&`', 'so a typed `<b>` is text there and the styling tags are tags', 'Not carried:', 'a link on a flowchart label (a label holds none)', 'code inside a plain field (it comes in as its text)', 'a scene node\'s title that begins with a space (written plain)', 'a `]` in its caption is written `\\]`, and read back as part of the caption', 'its own text may hold a `%` and, in a node\'s label, a `|` as they are', 'a flowchart label that holds a carriage return (written plain', 'comes back as the field\'s own', 'A file with no style in it is read exactly as before', 'beside a span the block\'s bold and italic are written as `<b>` / `<i>` wherever the marks would not read back', 'a span lives inside one paragraph'].every(w => guide.indexOf(w) > 0)
                && guide.indexOf('an export writes the plain text and an import brings no format') < 0 && guide.indexOf('a field has one size') < 0 && guide.indexOf('a caption whose text holds a `]`') < 0 && ixH.indexOf('a caption that holds a ]') < 0 && guide.indexOf('whose own text holds those label tags (written plain)') < 0 && ixH.indexOf('a field has one size') < 0
                && ['Save Markdown keeps text style and an import brings it back', 'strike-through as ~~, underline as &lt;u&gt;, a link as [text](https://&hellip;)', 'around the whole field or around just the part that has it', '&lt;b&gt;, &lt;i&gt;, &lt;u&gt;, &lt;s&gt;, &lt;font color=d9534f&gt; and &lt;big&gt; / &lt;small&gt;', 'where **, *, ~~ or the bracket link would not read back (beside a coloured part, say, or a link in a table cell whose address holds a |) &lt;b&gt;, &lt;i&gt;, &lt;s&gt; and &lt;a href="&hellip;"&gt; are written instead', 'A styled flowchart label keeps its own text even when that text holds those tags', 'so a &lt;b&gt; you typed stays text and the chart reads back the same', 'Not carried: a link on a flowchart label (a label cannot hold one)', 'a subtitle that holds a * or a _, a title with a line break in it, a scene title that begins with a space.', 'A ] in a picture&rsquo;s caption is written \\] and read back as part of the caption, styled or not.', 'A file with none of this in it comes in exactly as before.', 'a tag opens and closes inside one paragraph: it does not reach across a blank line'].every(w => ixH.indexOf(w) > 0) && ixH.indexOf('Markdown has no colour and no size') < 0, '');
        }
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

        // sanitizeBare stays a published call (a page's markup less its look); a Markdown import no longer reads through it — it carries colour and size (the Markdown checks above)
        check('sanitizeBare: the page sanitiser less the look — a span or a font is just its text; everything else is what sanitizeHtml gives',
            sanitizeBare('<p>Plain <span style="color:#ff0000;font-size:1.728em">red <b>huge</b></span> and <font color="#00ff00">green</font> <a href="https://a.b/c">l</a><script>x</script></p>') === '<p>Plain red <b>huge</b> and green <a href="https://a.b/c" target="_blank" rel="noopener noreferrer">l</a></p>'
            && ['<p>a<br>b</p><ul><li>x</li></ul>', '<b>x</span>y</b>', '<p onclick="x()">t</p><img src=x onerror=alert(1)>', 'a &amp; b &mdash; <unknown>c</unknown>', '<div><i>x</div>y'].every(h => sanitizeBare(h) === sanitizeHtml(h)) && sanitizeBare(null) === '');


        /* ---- a size on a part, underline, strike and a link (the owner, 2026-10-02) ---- */
        const A = h => '<a href="' + h + '" target="_blank" rel="noopener noreferrer">', LK = 'https://a.example/';
        const noNest = h => !/<span style="[^"]*font-size[^"]*">(?:(?!<\/span>).)*<span style="[^"]*font-size/.test(h);   // no size inside a size
        check('fmtHtml (underline, strike): fixed words in the run\'s style — one text-decoration for both',
            fmtHtml('abcd', { spans: [{ s: 0, e: 1, u: true }, { s: 1, e: 2, st: true }, { s: 2, e: 3, u: true, st: true, b: true }] }) === '<span style="text-decoration:underline;">a</span><span style="text-decoration:line-through;">b</span><span style="font-weight:bold;text-decoration:underline line-through;">c</span>d'
            && fmtHtml('ab', { u: true }) === '<span style="text-decoration:underline;">ab</span>' && fmtHtml('ab', { color: RED, i: true, st: true }) === '<span style="color:#d9534f;font-style:italic;text-decoration:line-through;">ab</span>', fmtHtml('abcd', { spans: [{ s: 0, e: 1, u: true }, { s: 1, e: 2, st: true }, { s: 2, e: 3, u: true, st: true, b: true }] }));
        check('fmtHtml (a size on a part): a run\'s size is the fixed step in its own style — never a size inside a size: a field of one size still has one span around everything, and where its parts differ each run carries its own',
            fmtHtml('big and small', { spans: [{ s: 0, e: 3, size: 'huge' }, { s: 8, e: 13, size: 'small', color: RED }] }) === '<span style="font-size:1.728em;">big</span> and <span style="color:#d9534f;font-size:0.833em;">small</span>'
            && fmtHtml('ab', { size: 'large', spans: [{ s: 0, e: 1, size: 'huge' }] }) === '<span style="font-size:1.728em;">a</span><span style="font-size:1.2em;">b</span>'
            && fmtHtml('ab', { spans: [{ s: 0, e: 1, size: 'large', b: true }, { s: 1, e: 2, size: 'large' }] }) === '<span style="font-size:1.2em;"><span style="font-weight:bold;">a</span>b</span>'
            && noNest(fmtHtml('abcdef', { size: 'large', spans: [{ s: 0, e: 2, size: 'huge' }, { s: 1, e: 4, size: 'small', b: true }] })) && noNest(fmtRich('ab<b>cd</b>ef', { size: 'large', spans: [{ s: 0, e: 2, size: 'huge' }, { s: 1, e: 8, size: 'small', b: true }] })) && !noNest('<span style="font-size:1.2em;">a<span style="color:#d9534f;font-size:1.2em;">b</span></span>'),
            fmtHtml('big and small', { spans: [{ s: 0, e: 3, size: 'huge' }, { s: 8, e: 13, size: 'small', color: RED }] }) + ' / ' + fmtHtml('ab', { size: 'large', spans: [{ s: 0, e: 1, size: 'huge' }] }));
        check('fmtHtml (a link): a run with a link is an <a href> written exactly as the sanitiser writes a text block\'s — the same target and rel, the address escaped — around the run\'s escaped text; neighbours of one link share it; a whole field\'s link is one <a> inside its size',
            fmtHtml('see the map', { spans: [{ s: 4, e: 11, link: 'https://a.example/m?x=1&y="2"' }] }) === 'see ' + A('https://a.example/m?x=1&amp;y=&quot;2&quot;') + 'the map</a>'
            && fmtHtml('see the map', { spans: [{ s: 4, e: 11, link: LK }] }) === 'see ' + sanitizeHtml('<a href="' + LK + '">the map</a>')
            && fmtHtml('a<b', { spans: [{ s: 0, e: 2, link: LK, b: true }, { s: 2, e: 3, link: LK }] }) === A(LK) + '<span style="font-weight:bold;">a&lt;</span>b</a>'
            && fmtHtml('ab', { size: 'large', link: LK }) === '<span style="font-size:1.2em;">' + A(LK) + 'ab</a></span>'
            && fmtHtml('ab', { spans: [{ s: 0, e: 1, link: LK }, { s: 1, e: 2, link: 'https://b.example/' }] }) === A(LK) + 'a</a>' + A('https://b.example/') + 'b</a>'
            && fmtHtml('x', { link: 'https://a.example/"><script>alert(1)</script>' }) === A('https://a.example/&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;') + 'x</a>',
            fmtHtml('see the map', { spans: [{ s: 4, e: 11, link: 'https://a.example/m?x=1&y="2"' }] }) + ' / ' + fmtHtml('a<b', { spans: [{ s: 0, e: 2, link: LK, b: true }, { s: 2, e: 3, link: LK }] }));
        const BADLINKS = ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'https://a.example/\u0000', 'https://a\nb', 'https://a b', '//evil.example', '/saves/x', '" onmouseover="alert(1)', 'https://' + 'a'.repeat(2000), 7, { href: LK }, [LK]];
        check('fmtHtml / fmtRich (hostile): a link that is not allowed draws no <a> — the text is drawn and keeps the rest of its look; a size or a decoration that is none adds nothing',
            BADLINKS.every(v => fmtHtml('t<x', { b: true, link: v, spans: [{ s: 0, e: 1, link: v, i: true }] }) === '<span style="font-weight:bold;font-style:italic;">t</span><span style="font-weight:bold;">&lt;x</span>' && fmtRich('t x', { link: v, spans: [{ s: 0, e: 1, link: v }] }) === 't x')
            && fmtHtml('t', { u: 'yes', st: 1, size: 'large;position:fixed', spans: [{ s: 0, e: 1, size: '99em', u: 'underline;background:url(x)' }] }) === 't' && fmtRich('t', { u: 'yes', st: 1, spans: [{ s: 0, e: 1, size: '99em' }] }) === 't',
            String(BADLINKS.filter(v => fmtHtml('t<x', { b: true, link: v, spans: [{ s: 0, e: 1, link: v, i: true }] }).indexOf('<a') >= 0)));
        check('fmtRich (a link, underline, strike, a size on a part): the runs are laid over the field\'s text as before — a run\'s link is an <a> around its span, closed before any typed tag and opened again after it, and never opened inside a link the typed markup has open (the typed one stands)',
            fmtRich('see <b>the</b> map', { spans: [{ s: 4, e: 18, link: LK, u: true }] }) === 'see <b>' + A(LK) + '<span style="text-decoration:underline;">the</span></a></b>' + A(LK) + '<span style="text-decoration:underline;"> map</span></a>'
            && fmtRich('<a href="https://typed.example/">go</a> on', { link: 'https://run.example/' }) === A('https://typed.example/') + 'go</a>' + A('https://run.example/') + ' on</a>'
            && fmtRich('ab cd', { spans: [{ s: 0, e: 2, link: LK, b: true }, { s: 2, e: 5, link: LK, st: true }] }) === A(LK) + '<span style="font-weight:bold;">ab</span><span style="text-decoration:line-through;"> cd</span></a>'
            && fmtRich('<span style="font-size:1.728em">big</span> x', { spans: [{ s: 43, e: 44, size: 'small' }] }) === 'big <span style="font-size:0.833em;">x</span>'
            && [['see the map', { u: true, spans: [{ s: 4, e: 7, link: LK, size: 'huge' }, { s: 8, e: 11, st: true }] }], ['5 < 6', { link: LK }], ['ab', { size: 'small', st: true, spans: [{ s: 0, e: 1, link: LK }] }]].every(c => fmtRich(c[0], c[1]) === fmtHtml(c[0], c[1], sanitizeHtml)),
            fmtRich('see <b>the</b> map', { spans: [{ s: 4, e: 18, link: LK, u: true }] }) + ' / ' + fmtRich('<a href="https://typed.example/">go</a> on', { link: 'https://run.example/' }));
        // the page: every field kind with the new looks
        const more = { type: 'doc', id: 'd', meta: { title: 'T' }, blocks: [
            { id: 'm1', type: 'h1', title: 'Big day', sub: 'see map', fmt: { title: { spans: [{ s: 0, e: 3, size: 'large', u: true }] }, sub: { spans: [{ s: 4, e: 7, link: LK }] } } },
            { id: 'm2', type: 'h2', title: 'Sec', fmt: { title: { st: true } } },
            { id: 'm3', type: 'h3', title: 'Sub', fmt: { title: { link: LK, spans: [{ s: 0, e: 1, size: 'huge' }] } } },
            { id: 'm4', type: 'table', title: 'Tab', cols: ['A', 'B'], colFmt: [{ u: true }, { spans: [{ s: 0, e: 1, size: 'small' }] }], rows: [{ col1: 'old new', col2: 'yy', fmt: { col1: { spans: [{ s: 0, e: 3, st: true }, { s: 4, e: 7, link: LK }] }, col2: { size: 'large' } } }], fmt: { title: { u: true, st: true } } },
            { id: 'm5', type: 'image', src: '/saves/images/x.png', caption: 'cap', fmt: { caption: { spans: [{ s: 0, e: 1, size: 'large', link: LK }] } } },
            { id: 'm6', type: 'flowchart', nodes: [{ id: 'a', text: 'one\ntwo\nthree', fmt: { link: LK, spans: [{ s: 0, e: 3, size: 'large' }, { s: 4, e: 7, u: true }, { s: 8, e: 13, st: true, link: 'https://b.example/' }] } }], edges: [{ from: 'a', to: 'a', text: 'go', fmt: { u: true, link: LK } }] }
        ] };
        const hM = renderDoc(more, { mermaid: false }), sentM = cleanDoc(more), gotM = cleanDoc(sentM, { keepHidden: true });
        check('render (a size on a part, underline, strike, a link): a title, a subtitle, a section, a sub-heading, a table\'s title, heads and cells and a caption are drawn from their runs with the new looks',
            hM.indexOf('<h1><span style="text-decoration:underline;font-size:1.2em;">Big</span> day<span class="sub">see ' + A(LK) + 'map</a></span></h1>') > 0 && hM.indexOf('<h2><span style="text-decoration:line-through;">Sec</span></h2>') > 0
            && hM.indexOf('<h3 class="doc-h3">' + A(LK) + '<span style="font-size:1.728em;">S</span>ub</a></h3>') > 0 && hM.indexOf('<h3><span style="text-decoration:underline line-through;">Tab</span></h3>') > 0
            && hM.indexOf('<th><span style="text-decoration:underline;">A</span></th><th><span style="font-size:0.833em;">B</span></th>') > 0 && hM.indexOf('<td><span style="text-decoration:line-through;">old</span> ' + A(LK) + 'new</a></td><td><span style="font-size:1.2em;">yy</span></td>') > 0
            && hM.indexOf('<figcaption>' + A(LK) + '<span style="font-size:1.2em;">c</span></a>ap</figcaption>') > 0 && hM.indexOf('alt="cap"') > 0 && risksNone(hM) && linksOk(hM) && noNest(hM), hM);
        const lab = (t, f) => /a\["(.*)"\]/.exec(compileFlowchart({ nodes: [{ id: 'a', text: t, fmt: f }] }))[1];
        check('flowchart (a size on a part, underline, strike): <u> and <s> around a run; a size on a part is <big> / <small> around that run alone, never inside another; a label of one size keeps it around everything as before; line breaks are the label\'s own',
            lab('abcd', { spans: [{ s: 0, e: 1, u: true }, { s: 1, e: 2, st: true }, { s: 2, e: 3, size: 'huge', b: true }, { s: 3, e: 4, size: 'small', color: RED }] }) === '<u>a</u><s>b</s><big><big><big><b>c</b></big></big></big><small><font color=d9534f>d</font></small>'
            && lab('ab', { size: 'large', spans: [{ s: 0, e: 1, u: true }] }) === '<big><u>a</u>b</big>' && lab('a\nb', { spans: [{ s: 0, e: 3, size: 'large', st: true }] }) === '<big><s>a<br>b</s></big>'
            && lab('ab', { u: true, st: true, i: true, b: true, color: RED }) === '<font color=d9534f><s><u><b><i>ab</i></b></u></s></font>'
            && lab('one\ntwo\nthree', more.blocks[5].nodes[0].fmt) === '<big>one</big><br><u>two</u><br><s>three</s>' && lab('one\ntwo\nthree', more.blocks[5].nodes[0].fmt).replace(/<\/?(b|i|u|s|big|small|font)( color=[0-9a-f]{6})?>/g, '') === lab('one\ntwo\nthree', undefined),
            lab('abcd', { spans: [{ s: 0, e: 1, u: true }, { s: 1, e: 2, st: true }, { s: 2, e: 3, size: 'huge', b: true }, { s: 3, e: 4, size: 'small', color: RED }] }) + ' / ' + lab('one\ntwo\nthree', more.blocks[5].nodes[0].fmt));
        check('flowchart (a link): a label never carries one — its format holds none (labelFmt: from a file, on the wire, on a load), the rest of its look kept, and none is ever written into the chart\'s source',
            JSON.stringify(D.labelFmt({ link: LK, b: true, spans: [{ s: 0, e: 1, link: 'https://b.example/', u: true }] }, 'ab')) === JSON.stringify({ b: true, spans: [{ s: 0, e: 1, u: true }] }) && D.labelFmt({ link: LK }, 'ab') === undefined && D.labelFmt({ spans: [{ s: 0, e: 1, link: LK }] }, 'ab') === undefined && JSON.stringify(D.labelFmt({ size: 'large', spans: [{ s: 0, e: 1, color: RED }] }, 'ab')) === JSON.stringify({ size: 'large', spans: [{ s: 0, e: 1, color: RED }] })
            && lab('ab', { link: LK, spans: [{ s: 0, e: 1, link: 'https://b.example/', b: true }] }) === '<b>a</b>b' && compileFlowchart({ nodes: [{ id: 'a', text: 'ab', fmt: { link: LK } }] }) === compileFlowchart({ nodes: [{ id: 'a', text: 'ab' }] })
            && !/href|https|<a\b/.test(compileFlowchart(more.blocks[5])) && compileFlowchart(more.blocks[5]).indexOf('a -->|"<u>go</u>"| a') > 0
            && JSON.stringify(sentM.blocks[5].nodes[0].fmt) === JSON.stringify({ spans: [{ s: 0, e: 3, size: 'large' }, { s: 4, e: 7, u: true }, { s: 8, e: 13, st: true }] }) && JSON.stringify(sentM.blocks[5].edges[0].fmt) === '{"u":true}'
            && (() => { const b = cleanBlockFmts(JSON.parse(JSON.stringify(more.blocks[5]))); return JSON.stringify(b.nodes[0].fmt) === JSON.stringify(sentM.blocks[5].nodes[0].fmt) && JSON.stringify(b.edges[0].fmt) === '{"u":true}'; })(), JSON.stringify(sentM.blocks[5]));
        check('cleanDoc (a size on a part, underline, strike, a link): the new looks travel with a page — cleaned by the host, cleaned again by a player\'s app to the same, and drawn there exactly as on the GM\'s screen',
            JSON.stringify(sentM.blocks[0].fmt) === JSON.stringify({ title: { spans: [{ s: 0, e: 3, size: 'large', u: true }] }, sub: { spans: [{ s: 4, e: 7, link: LK }] } }) && JSON.stringify(sentM.blocks[2].fmt) === JSON.stringify({ title: { link: LK, spans: [{ s: 0, e: 1, size: 'huge' }] } })
            && JSON.stringify(sentM.blocks[3].rowFmt) === JSON.stringify([[{ spans: [{ s: 0, e: 3, st: true }, { s: 4, e: 7, link: LK }] }, { size: 'large' }]]) && JSON.stringify(sentM.blocks[3].fmt) === '{"title":{"u":true,"st":true}}'
            && JSON.stringify(gotM) === JSON.stringify(sentM) && renderDoc(gotM, { mermaid: false }) === hM, JSON.stringify(sentM.blocks).slice(0, 900));
        const hostLink = v => ({ type: 'doc', id: 'd', meta: { title: 'T' }, blocks: [
            { id: 'h1', type: 'h1', title: 'Title', sub: 'sub', fmt: { title: { link: v, b: true }, sub: { spans: [{ s: 0, e: 3, link: v, size: '9em', u: 'yes' }] } } },
            { id: 'h2', type: 'h2', title: 'Sec', fmt: { title: { spans: [{ s: 0, e: 1, link: v }, { s: 1, e: 3, link: LK }] } } }, { id: 'h3', type: 'h3', title: 'Sub', fmt: { title: { link: v } } },
            { id: 'h4', type: 'table', title: 'Tab', cols: ['A'], colFmt: [{ link: v }], rows: [{ col1: 'cell', fmt: { col1: { link: v, st: true } } }], fmt: { title: { link: v } } },
            { id: 'h5', type: 'image', src: '/saves/images/x.png', caption: 'cap', fmt: { caption: { link: v } } },
            { id: 'h6', type: 'flowchart', nodes: [{ id: 'a', text: 'x', fmt: { link: v } }], edges: [{ from: 'a', to: 'a', text: 'e', fmt: { link: v } }] } ] });
        check('cleanDoc / render (a hostile link in a page a host sends): javascript:, data:, a control character, white space inside, an over-long one, one that is no string — dropped from every field while the text and the rest of its look stay; the one allowed link beside them is kept; nothing drawn can run or call out',
            BADLINKS.every(v => { const c = cleanDoc(hostLink(v)), c2 = cleanDoc(JSON.parse(JSON.stringify(c)), { keepHidden: true }), h = renderDoc(c2, { mermaid: false }), raw = renderDoc(hostLink(v), { mermaid: false });
                return JSON.stringify(c.blocks[0].fmt) === '{"title":{"b":true}}' && c.blocks[0].title === 'Title' && c.blocks[0].sub === 'sub' && JSON.stringify(c.blocks[1].fmt) === JSON.stringify({ title: { spans: [{ s: 1, e: 3, link: LK }] } }) && !('fmt' in c.blocks[2]) && !('colFmt' in c.blocks[3]) && !('fmt' in c.blocks[3])
                    && JSON.stringify(c.blocks[3].rowFmt) === '[[{"st":true}]]' && !('fmt' in c.blocks[4]) && !('fmt' in c.blocks[5].nodes[0]) && !('fmt' in c.blocks[5].edges[0]) && JSON.stringify(c2) === JSON.stringify(c)
                    && (h.match(/<a /g) || []).length === 1 && h.indexOf('<h2>S' + A(LK) + 'ec</a></h2>') > 0 && (raw.match(/<a /g) || []).length === 1 && risksNone(h) && linksOk(h) && risksNone(raw) && linksOk(raw) && !/javascript:|data:text|onmouseover/i.test(h + raw); }),
            String(BADLINKS.filter(v => (renderDoc(hostLink(v), { mermaid: false }).match(/<a /g) || []).length !== 1)));
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

    /* ---- a text block's link (1.5.0, the Link control on a text block's own bar): through the sanitiser, and through Markdown both ways ---- */
    {
        const AH = 'https://a.example/x?y=1&z=2', OPENA = h => '<a href="' + h.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '" target="_blank" rel="noopener noreferrer">';
        const made = '<p>see ' + OPENA(AH) + 'the map</a> here</p>';   // as the control makes it
        check('text block link (sanitiser): the <a> the Link control makes is kept exactly; however an <a> is written in a block — attributes in another order, a handler, a style, a download, another target — it comes out as the one form, the address escaped, the fixed target and rel',
            sanitizeHtml(made) === made && sanitizeHtml('<p>see <a rel="x" target="_top" onclick="alert(1)" style="position:fixed" download="x" HREF="' + AH.replace(/&/g, '&amp;') + '">the map</a> here</p>') === made
            && sanitizeHtml('<p>see <a href=' + AH.replace(/&/g, '&amp;') + '>the map</a> here</p>') === made && sanitizeHtml('<a href="https://a.example/"><a href="https://b.example/">x</a></a>') === OPENA('https://a.example/') + '</a>' + OPENA('https://b.example/') + 'x</a>', sanitizeHtml('<a href="https://a.example/"><a href="https://b.example/">x</a></a>'));
        const HOSTILE = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', '&#106;avascript:alert(1)', '&#x6a;avascript:alert(1)', 'jav&Tab;ascript:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'file:///c:/x', '//evil.example/x', '/api/data', '#x', '', 'https://a b', 'https://a.example/&#10;x', 'https://' + 'a'.repeat(1993), 'ftp://a.example/x', 'mailto:a@b.example'];
        const TYPES = ['text', 'lede', 'oneline', 'callout', 'flare'];
        check('text block link (sanitiser): a hostile href typed, pasted or loaded into a text block never survives — a script address in any spelling (mixed case, a tab or an entity inside it), data:, another scheme, a protocol-relative or a local address, white space inside, an over-long one: the <a> is gone and its text stays, in the editing box\'s first draw, in the preview and on a page as a player\'s app holds and draws it, for every kind of text block',
            HOSTILE.every(h => { const c = '<p>go <a href="' + h.replace(/"/g, '&quot;') + '">there</a> now</p>', s = sanitizeHtml(c);
                return !/<a\b/i.test(s) && s.indexOf('go there now') >= 0 && !/javascript:|vbscript:|data:text/i.test(s.replace(/&[a-z#0-9]+;/gi, ''))
                    && TYPES.every(t => { const pl = cleanDoc(cleanDoc({ id: 'd', type: 'doc', meta: { title: 'P', players: true }, blocks: [{ id: 'b', type: t, content: c }, { id: 'c', type: t, content: made }] }), { keepHidden: true }), h2 = renderDoc(pl, {}), as = h2.match(/<a\b[^>]*>/g) || []; return as.length === 1 && as[0] === OPENA(AH); }); }),
            HOSTILE.filter(h => /<a\b/i.test(sanitizeHtml('<p>go <a href="' + h.replace(/"/g, '&quot;') + '">there</a> now</p>'))).join(' | '));
        if (M) {
            const ODD = ['https://b.example/a)b', 'https://b.example/(a', 'https://b.example/a(b)c', 'https://b.example/[x]', 'https://b.example/a]b', 'https://b.example/?q="x"', 'https://b.example/<y>', 'https://b.example/y>', 'https://b.example/a\\b', 'https://b.example/a*b*c', 'https://b.example/a_b_c', 'https://b.example/~~x~~', 'https://b.example/a`b', 'HTTP://B.example/', 'https://b.example/a|b', 'https://b.example/&amp;', 'https://b.example/x#y!'];
            const blocksOf = t => [made, '<p>' + OPENA(AH) + 'a <b>bold</b> c</a></p>', '<p>a <b>b' + OPENA(AH) + 'ol</a>d</b> c</p>', '<p>' + OPENA(AH) + '<span style="color:#d9534f">red</span></a> and more</p>', '<p>' + OPENA(AH) + 'te]xt [x] (y) *z*</a></p>', '<p>' + OPENA(AH) + AH.replace(/&/g, '&amp;') + '</a></p>']
                .concat(ODD.map(h => '<p>go ' + OPENA(h) + 'odd</a> on</p>'), t === 'text' ? ['<p>o' + OPENA(AH) + 'ne</a></p><p>' + OPENA(AH) + 'tw</a>o</p>', '<ul><li>' + OPENA(AH) + 'item</a></li></ul>'] : []).map(c => (t === 'text' ? c : c.slice(3, -4)));
            const trip = (kind, type, content) => { const md = M.docToMarkdown({ id: 'p', type: kind, meta: { title: 'T' }, blocks: [{ id: 'b', type: type, content: content }] }, {}).text, back = M.markdownToBlocks(md, { kind: kind }).blocks.filter(b => b.type === type)[0]; return { md: md, same: !!back && sanitizeHtml(back.content) === sanitizeHtml(content), again: !!back && M.docToMarkdown({ id: 'p', type: kind, meta: { title: 'T' }, blocks: [back] }, {}).text === md }; };
            const fails = [];
            ['planner', 'doc'].forEach(kind => TYPES.forEach(type => blocksOf(type).forEach(c => { const r = trip(kind, type, c); if (!r.same || !r.again) fails.push([kind, type, c]); })));
            const t1 = trip('planner', 'text', made), t2 = trip('doc', 'callout', '<b>go</b> ' + OPENA('https://b.example/a)b') + 'odd</a>'), t3 = trip('planner', 'text', '<p>' + OPENA('https://b.example/<y>') + 'odd</a></p>');
            check('text block link (Markdown both ways): a link in a text, lead, one-line, callout or flare block is written [text](address) and read back to the very same block — a planner and a page, a link across bold text, inside a bold word, around a coloured part, in two paragraphs, in a list; the same Markdown on a second export; ' + ODD.length + ' odd addresses too',
                fails.length === 0 && t1.md.indexOf('see [the map](' + AH + ') here') > 0, JSON.stringify(fails.slice(0, 2)) + t1.md.slice(-80));
            check('text block link (Markdown export): an address that [text](address) would not read back — one with a lone ( or ), or with < or > — is written as <a href="…"> with the address escaped (as a plain field\'s link is), and reads back to the same link; every other address keeps the bracket form (pinned: bracketLinkOk)',
                t2.same && t2.md.indexOf('<a href="https://b.example/a&#41;b">odd</a>') > 0 && t3.same && t3.md.indexOf('<a href="https://b.example/&lt;y&gt;">odd</a>') > 0 && trip('planner', 'text', '<p>' + OPENA('https://b.example/a(b)c') + 'odd</a></p>').md.indexOf('[odd](https://b.example/a(b)c)') > 0
                && /asA = !!hv && !bracketLinkOk\(hv\)/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'system', 'app', 'scripts', 'docmd.js'), 'utf8')), [t2.md.slice(-60), t3.md.slice(-60)]);
            const hostMd = ['[x](javascript:alert(1)) and <a href="javascript:alert(2)">y</a> and <a href="https://ok.example/" onclick="alert(3)" style="position:fixed">z</a> and [w](data:text/html,x) and <https://ok.example/auto> and [v](https://a b)', '', '> [!callout] [x](JAVASCRIPT:alert(1)) <a href="//evil.example/">y</a>'].join('\n');
            const hb = M.markdownToBlocks(hostMd, { kind: 'planner' }).blocks, hs = hb.map(b => sanitizeHtml(b.content)).join('\n'), has = hs.match(/<a\b[^>]*>/g) || [];
            check('text block link (Markdown import): a file\'s links come into a text block only through the sanitiser — a script address, data:, a protocol-relative one and one with a space are text; an allowed <a> loses its handler and style; an address in angle brackets is a link to itself',
                hb.length === 2 && has.length === 2 && has[0] === OPENA('https://ok.example/') && has[1] === OPENA('https://ok.example/auto') && !/onclick|position:fixed|javascript:|evil\.example"|data:text/i.test(hs.replace(/&[a-z#0-9]+;/gi, '')) , hs);
        }
    }

    /* ---- a diagram's link (1.5.0): one rule — a web address the link rule keeps, attached to a shape by its id, reaching the diagram
            library in ONE line that the strip writes itself: click <id> href "<address>" ---- */
    {
        const TFm = await import(url.replace(/docrender\.js$/, 'textfmt.js'));
        const dl = D.diagramLink, ll = D.linkLine, rl = D.readLinkLine, has = typeof dl === 'function' && typeof ll === 'function' && typeof rl === 'function';
        const J = v => JSON.stringify(v), OKA = 'https://ok.example/a?b=1&c=2#frag', LINE = 'click A href "' + OKA + '"', strip = stripMermaidLinks;
        const canonOf = t => String(t).split('\n').filter(l => has && !!rl(l));
        // The diagram library's own reading, with its own patterns (tools/sinkcheck.js pins each of them against the bundled file): what it
        // makes of a source before it reads it, which kind of diagram it takes it for, and the address it draws for a flowchart's link line
        const BLOCK = () => /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi, FRONT = /^-{3}\s*[\n\r](.*?)[\n\r]-{3}\s*[\n\r]+/s;
        const LIB = {
            cleanup: c => c.replace(/\r\n?/g, '\n').replace(/<(\w+)([^>]*)>/g, (m, tag, at) => '<' + tag + at.replace(/="([^"]*)"/g, "='$1'") + '>'),
            blocks: c => c.replace(BLOCK(), ''),
            comments: c => c.replace(/^\s*%%(?!{)[^\n]+\n?/gm, '').trimStart(),
            encode: t => t.replace(/style.*:\S*#.*;/g, s => s.substring(0, s.length - 1)).replace(/classDef.*:\S*#.*;/g, s => s.substring(0, s.length - 1)).replace(/#\w+;/g, s => { const d = s.substring(1, s.length - 1); return /^\+?\d+$/.test(d) ? 'ﬂ°°' + d + '¶ß' : 'ﬂ°' + d + '¶ß'; }),
            url: u => { const p = /[\u0000-\u001F\u007F-\u009F\u2000-\u200D\uFEFF]/gim, P = u.replace(p, '').replace(/&#(\w+)(^\w|;)?/g, (m, b) => String.fromCharCode(b)).replace(/&(newline|tab);/gi, '').replace(p, '').trim(); if (!P) return 'about:blank'; if (P[0] === '.' || P[0] === '/') return P; const R = P.match(/^.+(:|&colon;)/gim); return R && /^([^\w]*)(javascript|data|vbscript)/im.test(R[0]) ? 'about:blank' : P; },
            decode: s => s.replace(/ﬂ°°/g, '&#').replace(/ﬂ°/g, '&').replace(/¶ß/g, ';')
        };
        LIB.code = t => LIB.comments(LIB.blocks(LIB.cleanup(String(t).trim().replace(/<br\s*\/?>/gi, '<br/>')).replace(FRONT, '')));   // what its parser is handed
        LIB.kind = t => { const d = LIB.code(t).replace(FRONT, '').replace(BLOCK(), '').replace(/\s*%%.*\n/gm, '\n'); return /^\s*C4Context|C4Container|C4Component|C4Dynamic|C4Deployment/.test(d) ? 'c4' : /^\s*classDiagram/.test(d) ? 'class' : /^\s*erDiagram/.test(d) ? 'er' : /^\s*gantt/.test(d) ? 'gantt' : /^\s*sequenceDiagram/.test(d) ? 'sequence' : /^\s*(?:graph|flowchart)/.test(d) ? 'flow' : 'other'; };
        const attr = v => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), unattr = v => v.replace(/&(?:#(\d+)|(amp|quot|lt|gt));/g, (m, n, w) => n ? String.fromCharCode(+n) : { amp: '&', quot: '"', lt: '<', gt: '>' }[w]);
        LIB.drawn = src => { const m = /^click (\S+) href "([^"]+)"$/m.exec(LIB.encode(LIB.code(src))); return m ? unattr(LIB.decode(attr(LIB.url(m[2].trim())))) : null; };   // the address a flowchart's link line ends up as, in the drawing

        const KEEP = ['https://ok.example/', 'http://ok.example:8080/a/b.html?x=1&y=2#top', 'https://ok.example/p;q?r=s;t', 'https://ja.example/wiki/日本', 'https://ok.example/a%20b/(c)[d]{e}*+,=~!$\'@', 'https://user@ok.example/', 'https://ok.example/#a-b_c', 'https://ok.example/?q=a&amp=1&notify=2', OKA];
        const DROP = ['', null, undefined, 7, {}, ['https://ok.example/'], 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.example/x', '/api/data', 'ftp://a.example/', 'mailto:a@b.example', 'https://a b', 'https://ok.example/"x', 'https://ok.example/<b>', 'https://ok.example/a>b', 'https://ok.example/%%{init}%%', 'https://ok.example/a%%b', 'https://ok.example/?a=&#104;', 'https://ok.example/?a=&tab;b', 'https://ok.example/?a=&NewLine;b',
            'https://ok.example/#x;y', 'https://ok.example/#quot;', 'https://ok.example/#a?b;c', 'https://ok.example/\u200bx', 'https://ok.example/\u0085x', 'https://ok.example/ﬂ°x', 'https://ok.example/x¶ß', 'https://ok.example/a\nb', 'https://ok.example/a\u0000b', 'https://' + 'a'.repeat(1993)];
        let seed = 20261002; const rnd = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) % n; };
        const ALPHA = ['a', 'b', 'Z', '0', '9', '/', '?', '=', '&', '#', ';', '%', '.', '-', '_', '~', ':', '@', '!', '$', "'", '(', ')', '*', '+', ',', '[', ']', '{', '}', '|', '^', '`', '\\', '"', '<', '>', '%%', '&#', '&tab;', '&newline;', '#35;', '#quot;', '%%{', '}%%', 'style', 'classDef', '日', 'é', '\u200b', '\u200d', '\u0085', '\u00a0', ' ', 'ﬂ°', '¶ß', '<br>', 'amp;'];
        let kept = 0, refused = 0, wrong = null;
        if (has) for (let i = 0; i < 6000; i++) {
            let a = 'https://h' + rnd(9) + '.example/'; for (let k = rnd(14); k > 0; k--) a += ALPHA[rnd(ALPHA.length)];
            const k = dl(a); if (!k) { refused++; continue; } kept++;
            const id = ['style', 'classDef', 'n'][i % 3] + (i % 5), got = LIB.drawn('flowchart TD\n' + id + '["x"] --> z\n' + ll(id, k));
            if (k !== TFm.cleanLink(a) || got !== k || rl(ll(id, k)).link !== k) wrong = wrong || [a, k, got];
        }
        check('a diagram\'s link (the one rule, diagramLink): a web address the link rule keeps (textfmt.js cleanLink), trimmed — a query, a fragment, a ; in a path, another alphabet, a port, a name before an @ — and nothing else: no other scheme, no local or protocol-relative address, no space, nothing over-long, and none that the diagram library would not read back exactly as written (a quote, < or >, %%, &#, &tab; / &newline;, a ; after a #, a character it drops, its own placeholders); of 6,000 seeded addresses every one that is kept is cleanLink\'s own output and is drawn by the library — its own patterns applied in its own order — as the very same address',
            has && KEEP.every(a => dl(a) === a && TFm.cleanLink(a) === a) && DROP.every(a => dl(a) === '') && dl('  https://ok.example/  ') === 'https://ok.example/' && !wrong && kept > 400 && refused > 400
            && LIB.drawn('flowchart TD\nA-->B\nclick A href "https://ok.example/#x;y"') !== 'https://ok.example/#x;y' && LIB.drawn('flowchart TD\nA-->B\nclick A href "https://ok.example/?a=&#104;"') !== 'https://ok.example/?a=&#104;', J([wrong, kept, refused, has && KEEP.filter(a => dl(a) !== a), has && DROP.filter(a => dl(a) !== '')]));
        check('a diagram\'s link (the canonical line, linkLine / readLinkLine): click <id> href "<address>" — the id 1 to 64 letters, digits, _ or -, never a name every object carries; anything else gives no line, and only exactly that line reads back',
            has && ll('A', OKA) === LINE && ll('my-node_2', ' ' + OKA + ' ') === 'click my-node_2 href "' + OKA + '"' && ll('a'.repeat(64), OKA) !== '' && J(rl(LINE)) === J({ id: 'A', link: OKA })
            && ['', 'a'.repeat(65), 'A,B', 'A B', 'A"', 'a.b', 'é', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', '__defineGetter__', 7, null, undefined, ['A']].every(id => ll(id, OKA) === '') && ll('A', 'javascript:alert(1)') === '' && ll('A', 'https://ok.example/"x') === ''
            && [' ' + LINE, LINE + ' ', LINE + ' "tip"', LINE + ' _blank', 'click A "' + OKA + '"', 'CLICK A href "' + OKA + '"', 'click A  href "' + OKA + '"', 'click __proto__ href "' + OKA + '"', 'click A href "javascript:alert(1)"', 'click A href " ' + OKA + '"', LINE + '\n', '', null, 7].every(l => rl(l) === null));

        // every form the library itself reads as a link, in a flowchart and in a class diagram -> the one line, in the directive's place
        const FORMS = [
            ['graph TD\nA-->B\nclick A href "' + OKA + '"', 'graph TD\nA-->B\n' + LINE],
            ['flowchart LR\nA-->B\nclick A "' + OKA + '"', 'flowchart LR\nA-->B\n' + LINE],
            ['graph TD\nA-->B\n  click A href "' + OKA + '" "Open the <b>map</b>" _blank', 'graph TD\nA-->B\n' + LINE],
            ['graph TD\nA-->B\nclick A "' + OKA + '" "tip"', 'graph TD\nA-->B\n' + LINE],
            ['graph TD\nA-->B\nclick A "' + OKA + '" _self', 'graph TD\nA-->B\n' + LINE],
            ['graph TD\nA-->B\nclick   A   href   " ' + OKA + ' "', 'graph TD\nA-->B\n' + LINE],
            ['graph TD; A-->B; click A href "' + OKA + '"', 'graph TD; A-->B\n' + LINE],
            ['graph TD\nA-->B;click A "' + OKA + '"; C-->D\nE-->F', 'graph TD\nA-->B\n' + LINE + '\nE-->F'],
            ['graph TD\nA-->B\nclick A "' + OKA + '" call f()', 'graph TD\nA-->B\n' + LINE],
            ['flowchart-elk TD\nA-->B\nclick A "' + OKA + '"', 'flowchart-elk TD\nA-->B\n' + LINE],
            ['%%{init: {"theme":"dark"}}%%\ngraph TD\nA-->B\nclick A "' + OKA + '" "tip"', '%%{init: {"theme":"dark"}}%%\ngraph TD\nA-->B\n' + LINE],
            ['%% a chart\n\n  graph TD\nA-->B\nclick A "' + OKA + '"', '%% a chart\n\n  graph TD\nA-->B\n' + LINE],
            ['graph TD\nA-->B\nclick A href "' + OKA + '"\nclick B "https://ok.example/b"\nclick A call f()', 'graph TD\nA-->B\n' + LINE + '\nclick B href "https://ok.example/b"'],
            ['classDiagram\nclass Animal\nlink Animal "' + OKA + '"', 'classDiagram\nclass Animal\nclick Animal href "' + OKA + '"'],
            ['classDiagram\nclass Animal\nlink Animal "' + OKA + '" "tip" _blank', 'classDiagram\nclass Animal\nclick Animal href "' + OKA + '"'],
            ['classDiagram\nclass Animal\nclick Animal href "' + OKA + '" "tip"', 'classDiagram\nclass Animal\nclick Animal href "' + OKA + '"'],
            ['classDiagram-v2\nclass S; link S "' + OKA + '"\nclass T', 'classDiagram-v2\nclass S\nclick S href "' + OKA + '"\nclass T']
        ];
        const formsBad = FORMS.filter(f => strip(f[0]) !== f[1] || strip(f[1]) !== f[1] || !f[1].split('\n').some(l => has && rl(l)));
        check('a diagram\'s link (the strip writes the one line): in a flowchart click <id> href "address" and click <id> "address", in a class diagram link <Class> "address" and click <Class> href "address" — with a tooltip, a target, both, more spaces, an indent, behind a ;, behind the library\'s own %%{init}%% block or a comment line — each become click <id> href "<address>" on a line of its own in the statement\'s place, the address trimmed and whatever follows it dropped; the rest of the diagram is as it was, and the result stripped again is itself',
            has && formsBad.length === 0, J(formsBad.slice(0, 2).map(f => [f[0], strip(f[0])])));

        // statements of a text, as the strip counts them: one ends at a line break or at a ; that does not close one of the library's #…; codes
        const WORD = /^\s*(?:click|callback|href|linkStyle)\b/i, CLASSLINK = /^\s*link\s+(?![-=.<>~&|:\s"'])[^"'\n;]*["']/i;
        const stmts = line => { const out = []; let from = 0; for (let at = line.indexOf(';'); at >= 0; at = line.indexOf(';', at + 1)) { if (/#\w+$/.test(line.slice(0, at))) continue; out.push(line.slice(from, at)); from = at + 1; } out.push(line.slice(from)); return out; };
        const onlyCanon = t => has && String(t).split(/\r\n|\n|\r/).every(line => !!rl(line) || stmts(line).every(s => !WORD.test(s) && !CLASSLINK.test(s)));   // no click statement but the canonical line, whole
        const noClick = t => onlyCanon(t) && canonOf(t).length === 0;
        const G = 'graph TD\nA-->B\n', C = 'classDiagram\nclass S\n';
        const HOSTILE = [
            G + 'click A href "javascript:alert(1)"', G + 'click A "JaVaScRiPt:alert(1)"', G + 'click A href "data:text/html,<script>alert(1)</script>"', G + 'click A "//evil.example/x"', G + 'click A href "/saves/data.json"', G + 'click A "vbscript:x"', G + 'click A href "ftp://a.example/"',
            G + 'click A href "https://ok.example/', G + 'click A href "https://ok.example/\ncall f()"', G + 'click A href "https://ok.example/a b"', G + 'click A href "https://ok.example/<img src=x onerror=alert(1)>"', G + 'click A href "https://ok.example/#x;click B call f()"', G + 'click A href "https://ok.example/%%{a}%%"',
            G + 'click A call f("https://ok.example/")', G + 'click A call f()', G + 'click A callback "https://ok.example/"', G + 'click A href call f()', G + 'click A f "https://ok.example/"', G + 'callback A "https://ok.example/"', G + 'href A "https://ok.example/"', G + 'click A href \'https://ok.example/\'', G + 'click A href https://ok.example/',
            G + 'click A,B href "https://ok.example/"', G + 'click __proto__ href "https://ok.example/"', G + 'click constructor "https://ok.example/"', G + 'click toString "https://ok.example/"', G + 'click "A" href "https://ok.example/"', G + 'click A.b href "https://ok.example/"', G + 'click <b> "https://ok.example/"', G + 'click ' + 'a'.repeat(65) + ' "https://ok.example/"', G + 'click é "https://ok.example/"',
            G + 'CLICK A href "https://ok.example/"', G + 'click A HREF "https://ok.example/"', G + 'Click A "https://ok.example/"', G + 'link A "https://ok.example/"',
            C + 'click S "https://ok.example/"', C + 'click S call f()', C + 'callback S "https://ok.example/"', C + 'link S \'https://ok.example/\'', C + 'LINK S "https://ok.example/"', C + 'link `A B` "https://ok.example/"', C + 'link S "javascript:alert(1)"', C + 'link __proto__ "https://ok.example/"',
            'gantt\nsection S\nTask :A, 2024-01-01, 1d\nclick A href "https://ok.example/"', 'gantt\nsection S\nTask :A, 2024-01-01, 1d\nclick A "https://ok.example/"', '  gantt\nclick A href "https://ok.example/"',
            'sequenceDiagram\nparticipant A\nlink A: Site @ https://ok.example/\nlinks A: {"x": "https://ok.example/"}\nclick A href "https://ok.example/"', 'stateDiagram-v2\n[*] --> A\nclick A href "https://ok.example/"', 'erDiagram\nA ||--o{ B : has\nclick A href "https://ok.example/"', 'pie\n"a" : 1\nclick A href "https://ok.example/"', 'click A href "https://ok.example/"', '',
            '---\ntitle: x\n---\ngraph TD\nA-->B\nclick A href "https://ok.example/"', '%%{a b gantt}%%\ngraph TD\nA-->B\nclick A href "https://ok.example/"', '%%{a b}%% gantt\ngraph TD\nclick A href "https://ok.example/"', '%%{%%{a}%%b}%%graph TD\nA-->B\nclick A href "https://ok.example/"', '%%; click A href "https://ok.example/"\ngraph TD\nA-->B'
        ];
        const hostBad = HOSTILE.filter(s => !noClick(strip(s)) || !noClick(LIB.blocks(strip(s))) || strip(strip(s)) !== strip(s));
        const kept1 = strip(G + 'click A "https://ok.example/" "<img src=x onerror=alert(1)>" _self'), kept2 = strip(G + 'click A href "https://ok.example/" onclick="alert(1)" target="_top"'), kept3 = strip(G + 'click A "https://ok.example/"; click B call f()');
        check('a diagram\'s link (what is never kept): a script, data: or other scheme, a local or protocol-relative address, an address with a quote, a space or a line break trying to end the statement, a callback or a call dressed as a link, a statement in another case or another diagram\'s form, an id that is no id (a list, a name every object carries, a quoted or dotted one, one too long), and EVERY link statement of a diagram that is no flowchart and no class diagram — a Gantt chart, where the library would steer the app\'s own window, a sequence, state or ER diagram, a source with front matter, one whose kind hides behind a block — are removed whole: nothing that begins with a click word is left, as the strip leaves it and as the library reads it once its blocks are out; a tooltip or a target carrying markup is dropped and its link kept',
            has && hostBad.length === 0 && [kept1, kept2, kept3].every(o => o === G + 'click A href "https://ok.example/"') && HOSTILE.length > 50, J(hostBad.slice(0, 3).map(s => [s, strip(s)])));

        // the library's blocks: a link line is never one it would put together, and a block does not take a chart's links away
        const asm = strip('graph TD\nA-->B\ncl%%{a}%%ick A href "https://ok.example/"'), asm2 = strip('classDiagram\nclass S\n%%{x}%%link S "https://ok.example/"'), asm3 = strip('graph TD\nA-->B\nclick A href "https://ok.example/%%{a}%%x"'), swallowed = strip('%%{a: {\nclick q }%%\ngraph TD\n}%% gantt\nsection S\nT :A, 2024-01-01, 1d\nclick A href "https://ok.example/"');
        check('a diagram\'s link (the library\'s %%{…}%% blocks): a link statement the library would only read once it has taken a block out — split by one, standing behind one — is not passed through as it stands: the source is handed over without its blocks and with the line the strip wrote; an address is never one a block would change; and a source that reads as a flowchart only until the library\'s blocks are out (a Gantt chart behind a block) keeps no link',
            has && asm === 'graph TD\nA-->B\nclick A href "https://ok.example/"' && asm2 === 'classDiagram\nclass S\nclick S href "https://ok.example/"' && noClick(asm3) && noClick(swallowed) && noClick(LIB.blocks(swallowed)) && LIB.kind(swallowed) === 'gantt', J([asm, asm2, asm3, swallowed]));

        // a seeded corpus of sources: whatever it is made of, nothing but the canonical line is left — as it stands and as the library reads it
        const FR = ['graph TD', 'flowchart LR', 'classDiagram', 'gantt', 'sequenceDiagram', 'stateDiagram-v2', '---', 'A-->B', 'class S', 'A["x; y"]', ';', ' ; ', '\n', '\n', '\n', '\n', '\r', '\r\n', '\u0000', 'click ', 'click A ', 'click S href ', 'CLICK A ', 'href ', 'call f()', 'callback ', 'link S ', 'links A: ', 'link A: x @ ', '"https://ok.example/a"', '"https://ok.example/b" "tip" _blank', '"javascript:alert(1)"', '"https://ok.example/', 'https://ok.example/c"', '"',
            '%%{init: {"theme":"dark"}}%%', '%%{', '}%%', '%%{a}%%', '%% ', '#quot;', '#59;', 'A,B ', '__proto__ ', 'constructor ', 'S ', 'A ', ' ', 'cl', 'ick ', 'li', 'nk ', 'title x', 'section s', 'T :A, 2024-01-01, 1d', '&#99;', '&quot;', '&amp;', '<b>', '<!-- -->', '&#59;'];
        const WHOLE = ['click A "https://ok.example/a"', 'click A href "https://ok.example/b" "tip" _blank', 'click S href "https://ok.example/s"', 'link S "https://ok.example/t" "tip"', 'click B "https://ok.example/c" call f()', 'click A call f()', 'click A href "javascript:alert(1)"', 'link S "data:text/html,x"', 'callback S "f"', 'click A,B "https://ok.example/d"', 'A-->B', 'class S'], SEP = ['\n', '\n', '\n', '\n', ';', ' ; ', '\r', '\r\n', '%%{a}%%\n', '\u0000\n', ' '];
        const HEADS = ['graph TD\n', 'flowchart LR\n', 'classDiagram\n', 'gantt\n', 'sequenceDiagram\n', '%%{init: {"theme":"dark"}}%%\ngraph TD\n', '%% c\nflowchart TD\n', ''];
        const mpD = D.mermaidPre, dec2 = h => h.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        let srcBad = null, withLinks = 0, preLinks = 0; const kinds = {};
        if (has) for (let i = 0; i < 4000 && !srcBad; i++) {
            let s = HEADS[rnd(HEADS.length)]; for (let k = 3 + rnd(12); k > 0; k--) s += rnd(3) ? FR[rnd(FR.length)] : WHOLE[rnd(WHOLE.length)] + SEP[rnd(SEP.length)];
            const out = strip(s), mine = canonOf(out), once = LIB.blocks(out); let all = once; for (let k = 0; k < 8 && all.indexOf('%%{') >= 0; k++) all = LIB.blocks(all);
            const read = canonOf(LIB.code(out)), kind = LIB.kind(out);
            const ok = onlyCanon(out) && strip(out) === out && onlyCanon(once) && onlyCanon(all) && canonOf(once).every(l => mine.indexOf(l) >= 0) && canonOf(all).every(l => mine.indexOf(l) >= 0)
                && (read.length === 0 || kind === 'flow' || kind === 'class') && out.indexOf('\u0000') < 0 && out.indexOf('\r') < 0;
            if (read.length) { withLinks++; kinds[kind] = (kinds[kind] || 0) + 1; }
            const pre = dec2(mpD(s)); if (canonOf(pre).length) preLinks++;
            if (!ok || !onlyCanon(pre) || strip(pre) !== pre) srcBad = [s, out, pre];
        }
        check('a diagram\'s link (4,000 seeded sources — heads of every kind, statements, quotes, separators, the library\'s blocks and codes, line breaks of every sort, character references): what the strip hands over holds no statement that begins with a click word but whole canonical lines, and stripped again it is itself; the same is true once the library has taken its blocks out, once or to the end, and no canonical line appears there that the strip did not write; where the library is left a link to read it takes the source for a flowchart or a class diagram — never a Gantt chart, never anything else; a planner\'s preview (mermaidPre, as the library reads the markup) the same',
            has && !srcBad && withLinks > 150 && preLinks > 100 && Object.keys(kinds).every(k => k === 'flow' || k === 'class') && kinds.flow > 50 && kinds.class > 10, J([srcBad, withLinks, preLinks, kinds]));
        const many = G + Array.from({ length: 10000 }, (x, i) => i % 4 === 0 ? 'click A call f' + i + '()' : i % 4 === 1 ? 'click N' + i + ' "https://ok.example/' + i + '" "tip ' + i + '"' : i % 4 === 2 ? 'click N' + i + ' href "javascript:alert(' + i + ')"' : 'click N' + i + ' href "https://ok.example/' + i + '" _self').join('\n'), t10 = Date.now(), manyOut = strip(many), ms10 = Date.now() - t10;
        check('a diagram\'s link (10,000 link lines): the 5,000 the rule keeps come out as 5,000 canonical lines, the callbacks and the script addresses are gone, the chart itself stays, in well under two seconds',
            has && onlyCanon(manyOut) && canonOf(manyOut).length === 5000 && manyOut.indexOf(G) === 0 && manyOut.split('\n').length === 5002 && ms10 < 2000 && manyOut.indexOf('click N1 href "https://ok.example/1"\nclick N3 href "https://ok.example/3"') > 0, [canonOf(manyOut).length, ms10]);

        // the built flowchart: a node carries a link, an arrow never
        const fcL = { type: 'flowchart', dir: 'TD', nodes: [{ id: 'a', text: 'Start', shape: 'rect', color: 'gold', link: OKA }, { id: 'b c', text: 'x', link: '  https://ok.example/b  ' }, { id: 'c', text: 'no link' }, { id: 'd', text: 'bad', link: 'javascript:alert(1)' }, { id: 'e', text: 'bad', link: 'https://ok.example/"\nclick a call alert(1)' }, { id: 'constructor', text: 'p', link: OKA }, { id: 'click', text: 'k', link: OKA }, { id: 'f', text: 'click f href "https://evil.example/"; click f call g()', link: 'https://ok.example/f' }],
            edges: [{ from: 'a', to: 'c', text: 'go', link: OKA }, { from: 'c', to: 'd', text: 'click a href "https://evil.example/"' }] };
        const noLink = JSON.parse(J(fcL)); noLink.nodes.forEach(n => { delete n.link; }); noLink.edges.forEach(e => { delete e.link; });
        const cm = compileFlowchart(fcL), cm0 = compileFlowchart(noLink), cmLines = cm.split('\n'), tail = ['click a href "' + OKA + '"', 'click b_c href "https://ok.example/b"', 'click click href "' + OKA + '"', 'click f href "https://ok.example/f"', ''];
        const inh = Object.create({ link: OKA }); inh.id = 'z'; inh.text = 'z';
        check('compileFlowchart (a linked node): a node\'s link is written as the canonical line, after everything else — its id as the compiler writes ids, its address by the one rule; a node with no link, with one the rule refuses (a script address, one that tries to end the statement), with an id every object carries, or with a link it only inherits gets no line, an arrow never one; a chart with no link compiles exactly as before; a label that says "click …" is still one quoted string',
            has && cm.indexOf(cm0) === 0 && cm.slice(cm0.length) === tail.join('\n') && cm0 === compileFlowchart(JSON.parse(J(noLink))) && !/click|href/.test(compileFlowchart({ nodes: [inh], edges: [{ from: 'z', to: 'z', link: OKA }] }))
            && cmLines.filter(l => /^click /.test(l)).length === 4 && cm.indexOf('f["click f href #quot;https://evil.example/#quot;; click f call g()"]:::neutral') > 0, cm.slice(cm0.length));
        const st = strip(cm, true), stLines = st.split('\n');
        check('stripMermaidLinks (the app\'s own compiled flowchart, with links): the compiled path keeps exactly the canonical lines the compiler wrote and no other line that begins with a click word — the node called click loses its own line, as before, and keeps none; a line that is nearly the canonical one (a tooltip, a target, a call, another address) goes; the labels are untouched',
            has && stLines.filter(l => /^click\b/.test(l)).join('|') === tail.slice(0, 4).join('|') && st.indexOf('click["k"]') < 0 && st.indexOf('f["click f href #quot;https://evil.example/#quot;; click f call g()"]:::neutral') > 0
            && strip('x\n' + LINE + '\n' + LINE + ' "tip"\n' + LINE + ' _blank\nclick A call f()\nclick A href "javascript:alert(1)"\nclick A "' + OKA + '"\n ' + LINE + '\ny', true) === 'x\n' + LINE + '\ny' && strip(st, true) === st, st.split('\n').slice(-6).join(' | '));

        // cleanDoc both ways, and a load / an import (cleanBlockFmts)
        const pageL = { type: 'doc', id: 'doc_l', meta: { title: 'Links', players: true }, blocks: [
            { id: 'b1', type: 'flowchart', dir: 'TD', nodes: JSON.parse(J(fcL.nodes)).concat([{ id: 'g', text: 'g', link: { toString() { return OKA; } } }, { id: 'h', text: 'h', link: 7 }]), edges: JSON.parse(J(fcL.edges)) },
            { id: 'b2', type: 'diagram', content: G + 'click A "' + OKA + '" "tip <img src=x onerror=alert(1)>" _top\nclick B call alert(1)\nclick B href "javascript:alert(1)"' },
            { id: 'b3', type: 'diagram', content: C + 'link S "' + OKA + '"\ncallback S "f"' },
            { id: 'b4', type: 'diagram', content: 'gantt\nsection S\nT :A, 2024-01-01, 1d\nclick A href "' + OKA + '"' }] };
        const sentL = cleanDoc(pageL), gotL = sentL && cleanDoc(JSON.parse(J(sentL)), { keepHidden: true }), nodesL = sentL ? sentL.blocks[0].nodes : [], htmlL = sentL ? renderDoc(gotL) : '';
        check('cleanDoc (a diagram\'s link, the host\'s and a player\'s again): a node keeps its link by the one rule — trimmed, an own string — and loses one the rule refuses while the node itself stays; an arrow carries none; a diagram block\'s link statements come out as canonical lines (a flowchart\'s, a class diagram\'s) and everything else about a click is gone — a Gantt chart keeps none; cleaned again by a player\'s app it is the same, and the page draws with those lines and no other click statement',
            has && !!sentL && nodesL.length === 10 && J(nodesL.map(n => n.link || null)) === J([OKA, 'https://ok.example/b', null, null, null, OKA, OKA, 'https://ok.example/f', null, null]) && sentL.blocks[0].edges.every(e => !('link' in e))
            && sentL.blocks[1].content === G + LINE && sentL.blocks[2].content === C + 'click S href "' + OKA + '"' && sentL.blocks[3].content === 'gantt\nsection S\nT :A, 2024-01-01, 1d' && J(gotL) === J(sentL)
            && (htmlL.match(/click [A-Za-z_]+ href &quot;https:\/\/ok\.example\/[^&]*(?:&amp;[^&]*)*&quot;/g) || []).length === 6 && !/call alert|javascript:|onerror|_top|callback/.test(htmlL), J([nodesL.map(n => n.link || null), sentL && sentL.blocks.slice(1).map(b => b.content)]));
        const cb = D.cleanBlockFmts(JSON.parse(J(pageL.blocks[0]))), cb2 = D.cleanBlockFmts(JSON.parse(J(cb))), plainB = { type: 'flowchart', nodes: [{ id: 'a', text: 'x' }], edges: [{ from: 'a', to: 'a', text: 'e' }] };
        check('cleanBlockFmts (a load, an import): a node\'s link is cleaned in place by the same rule — kept, trimmed, or taken off while the node stays — and an arrow\'s is taken off; twice is the same; a chart with no link is left exactly as it is',
            has && J(cb.nodes.map(n => 'link' in n ? n.link : null)) === J([OKA, 'https://ok.example/b', null, null, null, OKA, OKA, 'https://ok.example/f', null, null]) && cb.edges.every(e => !('link' in e)) && J(cb2) === J(cb) && J(D.cleanBlockFmts(JSON.parse(J(plainB)))) === J(plainB), J(cb.nodes.map(n => n.link)));

        // Markdown, out and in and out again
        if (M) {
            const plan = { id: 'p', type: 'planner', meta: { title: 'T' }, blocks: [{ id: 'f1', type: 'flowchart', dir: 'LR', space: 'normal', zoom: 1, nodes: [{ id: 'a', text: 'Start', shape: 'rect', color: 'gold', link: OKA }, { id: 'b', text: 'End', shape: 'pill', color: 'neutral', fmt: { b: true } }, { id: 'c', text: 'Bad', shape: 'rect', color: 'neutral', link: 'javascript:alert(1)' }], edges: [{ from: 'a', to: 'b', text: 'go', style: 'solid' }] },
                { id: 'd1', type: 'diagram', content: G + 'click A "' + OKA.replace(/&/g, '&amp;') + '" "tip"\nclick B call f()' }, { id: 'd2', type: 'diagram', content: C + 'link S "https://ok.example/s"' }] };
            const trip = kind => { const it = JSON.parse(J(plan)); it.type = kind; if (kind === 'doc') it.blocks[1].content = G + 'click A "' + OKA + '" "tip"\nclick B call f()'; const md = M.docToMarkdown(it, {}).text, back = M.markdownToBlocks(md, { kind: kind }).blocks, md2 = M.docToMarkdown({ id: 'p', type: kind, meta: { title: 'T' }, blocks: back }, {}).text; return { md, back, md2 }; };
            const tp = trip('planner'), td = trip('doc'), fcOf = r => r.back.filter(b => b.type === 'flowchart')[0], dgOf = r => r.back.filter(b => b.type === 'diagram');
            const hostileMd = ['```flowchart', 'flowchart TD', 'a["A"]', 'b["B"]', 'a --> b', 'click a href "https://ok.example/a"', 'click b href "javascript:alert(1)"', '```', '', '```flowchart', 'flowchart TD', '__proto__["x"]', 'constructor["y"]', '__proto__ --> constructor', '```', '', '```mermaid', 'gantt', 'section S', 'T :A, 2024-01-01, 1d', 'click A href "https://ok.example/"', '```', '', '```mermaid', 'graph TD', 'A-->B', 'click A "https://ok.example/x" "tip" _blank', 'click B call f()', '```'].join('\n');
            const before = Object.getOwnPropertyNames(Object.prototype), beforeO = Object.getOwnPropertyNames(Object), hb2 = M.markdownToBlocks(hostileMd, { kind: 'doc' }).blocks, protoSame = J(Object.getOwnPropertyNames(Object.prototype)) === J(before) && J(Object.getOwnPropertyNames(Object)) === J(beforeO) && ({}).text === undefined && ({}).link === undefined;
            Object.getOwnPropertyNames(Object.prototype).filter(n => before.indexOf(n) < 0).forEach(n => { delete Object.prototype[n]; }); Object.getOwnPropertyNames(Object).filter(n => beforeO.indexOf(n) < 0).forEach(n => { delete Object[n]; });   // (an unfixed reader's marks, taken off again so that the checks after this one still mean something)
            check('a diagram\'s link (Markdown both ways): Save Markdown writes a built node\'s link as the canonical line in the flowchart\'s fence, after its arrows, and a hand-written diagram with its link statements as canonical lines and its other click statements gone; an import reads the line back into the node\'s link and the diagram back as it was written; the same file on a second export — a planner and a page',
                has && [tp, td].every(r => r.md === r.md2 && r.md.indexOf('a -->|"go"| b\nclick a href "' + OKA + '"\n```') > 0 && (r.md.match(/^click /gm) || []).length === 3 && r.md.indexOf('A-->B\n' + LINE + '\n```') > 0 && r.md.indexOf('class S\nclick S href "https://ok.example/s"\n```') > 0 && !/call f|javascript|tip/.test(r.md)
                    && !!fcOf(r) && fcOf(r).nodes[0].link === OKA && !('link' in fcOf(r).nodes[1]) && !('link' in fcOf(r).nodes[2]) && J(fcOf(r).nodes[1].fmt) === '{"b":true}' && dgOf(r).length === 2), [tp.md, td.md === td.md2]);
            check('a diagram\'s link (a Markdown file from someone else): a flowchart fence whose link line carries an address the rule refuses is not read as a built flowchart with that link — it stays a diagram, and the strip takes the line out; a diagram fence comes in with its links as canonical lines and nothing else about a click (a Gantt chart with none); a fence whose nodes are named for what every object carries writes nothing onto any prototype',
                has && hb2.length === 4 && hb2[0].type === 'diagram' && noClick(hb2[0].content.replace('click a href "https://ok.example/a"', '')) && canonOf(hb2[0].content).join('|') === 'click a href "https://ok.example/a"' && hb2[2].content === 'gantt\nsection S\nT :A, 2024-01-01, 1d' && hb2[3].content === 'graph TD\nA-->B\nclick A href "https://ok.example/x"' && protoSame
                && (hb2[1].type !== 'flowchart' || hb2[1].nodes.every(n => typeof n.id === 'string' && Object.prototype.hasOwnProperty.call(n, 'text'))), J([hb2.map(b => b.type), hb2[0].content, protoSame]));
        }
    }

    {   // said: Help, the tour and the integration guide on a diagram's link — and the guide's numbers are the code's own
        const fsS = require('fs'), rdS = f => fsS.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
        const helpS = rdS('system/app/index.html'), tourS = rdS('system/app/scripts/tutorial.js'), guideS = rdS('CAMPAIGN_INTEGRATION.md'), TFs = await import(url.replace(/docrender\.js$/, 'textfmt.js'));
        const txtS = h => h.replace(/<[^>]+>/g, '').replace(/&rsquo;/g, '\'').replace(/&mdash;/g, '-').replace(/&hellip;/g, '...').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
        const HS = txtS(helpS), okA = 'https://ok.example/x';
        check('said (a diagram\'s link, Help): Planners > Text style says where a node\'s link is set — the Link box on a node\'s label links the whole node, a click on the node opens it, in the preview a drag and the corner handle still work and only a plain click opens the link, an arrow has none — and that a flowchart label still cannot hold a link; the one link line a diagram block may hold, in a flowchart and in a class diagram, that what follows the address is dropped, that other kinds keep no link and that click actions which call a function never work; the Handbook says a link from someone else asks the player first; the Markdown section says how a node\'s link is written',
            ['A flowchart label cannot hold a link, but a flowchart node can: click into a node\'s label and the Link box links the whole node', 'a click on the node opens the address: directly in your own preview - where a drag still moves the node and its corner handle still resizes it, and only a plain click opens the link - and only after asking on a player\'s screen', 'An arrow cannot hold a link, so the Link box is greyed out on an arrow\'s label',
                'Links in a diagram. A Mermaid Diagram block can link a shape to a web page with one line of its own: in a flowchart click A href "https://example.com/page", where A is the shape\'s id; in a class diagram the same line with the class\'s name, or link Animal "https://example.com/page".', 'whatever follows it on that line (a tooltip, a target) is dropped, and the other kinds of diagram keep no link', 'Click actions that call a function - click A call ..., callback - never work, on your screen or on a player\'s.',
                'A diagram\'s link is a link like any other: your own opens directly, and one that came from someone else asks first.', 'A flowchart node\'s link and a diagram\'s link line work on a page as they do in a planner.',
                'A link on a flowchart node or in a diagram is a link like any other on a page: a click on it asks the player first and shows the site and the whole address - a link that came from someone else never opens unasked - and a click action that calls a function never runs, on anyone\'s screen.',
                'A flowchart node\'s link is written as one more line in the chart\'s fence - click a href "https://example.com/page", after the arrows - and read back onto the node; a diagram is written with its links as that same line. Not carried: a link on a flowchart label (a label cannot hold one)'].every(p => HS.indexOf(p) >= 0)
            && !/stricter mode that ignores link and click directives|a chart never carries web addresses/.test(helpS), ['A flowchart label cannot hold a link, but', 'Links in a diagram.', 'A link on a flowchart node or in a diagram', 'A flowchart node\'s link is written as one more line'].filter(p => HS.indexOf(p) < 0));
        check('said (a diagram\'s link, the tour and the integration guide): the planner step says the Link box on a flowchart node\'s label links the whole node; the guide names a node\'s "link" key with the cleaner\'s rule, a diagram block\'s link line (the forms read, the one canonical line, what an id and an address may be, that everything else about a click is removed and that the library runs strict for everyone) and the Markdown form — and its numbers are the code\'s: an id of 64 characters is taken and one of 65 is not, an address is at most the link rule\'s length',
            /on a flowchart node&rsquo;s label it links the <b>whole node<\/b>, which a click in the preview then opens\)/.test(tourS)
            && ['**A diagram may link a shape to a web page** with one line of its own: in a flowchart `click <id> href "https://…"` (also read: `click <id> "https://…"`), in a class diagram `click <Class> href "https://…"` or `link <Class> "https://…"`.', 'The app keeps exactly one canonical line for it, `click <id> href "<address>"`', '`<id>` is 1–64 letters, digits, `_` or `-`', 'at most ' + TFs.MAX_LINK + ' characters) that holds no `"`, `<`, `>`, `%%`, `&#`, `&tab;` / `&newline;` and no `;` after a `#`', 'drops whatever follows the address (a tooltip, a target)',
                'Every other click statement is removed (`call`, `callback`, a link in any other kind of diagram — a Gantt chart, a sequence diagram\'s menus), on load, on import, on the wire and again at every draw.', 'The diagram library runs in its strict mode for everyone, so an action that calls a function never runs',
                'A node may carry `"link": "https://…"` (optional, 1.5.0): the **whole node** becomes a link to that web page', 'dropped when it is not allowed while the node stays', 'An edge carries none', 'a node\'s own `"link"` key links the whole node instead: see the flowchart block', 'a node\'s link is one more line in that fence, `click a href "https://…"`, written after the arrows and read back onto the node'].every(p => guideS.indexOf(p) >= 0)
            && D.linkLine('a'.repeat(64), okA) !== '' && D.linkLine('a'.repeat(65), okA) === '' && D.diagramLink('https://' + 'a'.repeat(TFs.MAX_LINK - 8)) !== '' && D.diagramLink('https://' + 'a'.repeat(TFs.MAX_LINK - 7)) === '' && TFs.MAX_LINK === 2000);
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

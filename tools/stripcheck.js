/* Offline check of tools/stripcore.js, which takes the comments out of the app's own JavaScript, CSS and HTML for a release build and
   keeps every name (the manager's inquiry of 2026-11-16: the installed front end is readable, so its comments are the most useful map
   to someone reading it). What is held here:
   - every hard case of the JavaScript tokenizer by hand: strings in all three quotes, template literals with nested ${...} and
     templates inside them, regular-expression literals told from division by the token before (after a keyword, an if head, a block,
     an object, a postfix ++, a property named like a keyword), a // or a block comment inside a regex, a string or a template, a
     hashbang, a /*! licence, HTML-like comments left as code, line breaks kept (CRLF and the line separator too), a comment that held a
     line break still ending a statement, a NUL byte inside a string;
   - CSS and HTML by hand: strings, url(...), a comment that would join two words kept, attribute values, pre, textarea, inline script
     and style;
   - stripTree on a small tree of its own: the vendor and font folders, JSON and binary files byte for byte, a latin1 file, which
     scripts are classic, and each refusal (a file that grew, a lost line, tokens that differ, a module or a classic script that does
     not parse as its kind);
   - a seeded fuzz of generated JavaScript, judged three ways: the tokens the generator wrote, the tokens of the stripped program, and
     what V8 itself makes of the program before and after (each one is run and its result compared);
   - the REAL app: stripTree over a copy of system/app, every stripped module imported as parsecheck imports it, the token streams file
     by file, the vendor and font folders and every file left unstripped byte for byte, the NUL bytes of docpanel.js and popout.js, and
     the bytes saved, reported.
   Usage: node tools/stripcheck.js   (exit 1 on any failure) */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const { pathToFileURL } = require('url');
const S = require('./stripcore.js');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? ' -> ' + String(detail).slice(0, 400) : '')); } }
process.on('exit', function() { if (!summed) { console.log('FAIL      the suite never reached its summary (a check left waiting)'); process.exitCode = 1; } });
const j = JSON.stringify;
const ROOT = path.join(__dirname, '..'), APP = path.join(ROOT, 'system', 'app');
const LS = String.fromCharCode(0x2028), NUL = String.fromCharCode(0), BS = String.fromCharCode(92);
const tokv = (t) => S.jsTokens(t).map(x => x.v);
const same = (a, b) => j(S.jsTokens(a)) === j(S.jsTokens(b));
// What a script comes to when V8 runs it in a fresh context: 'ok:' and its last value as JSON, or 'err:' and the error's name.
function run(code) {
    try { const v = vm.runInNewContext(code, {}, { timeout: 2000 }); return 'ok:' + j(v === undefined ? '(undefined)' : v); }
    catch (e) { return 'err:' + (e && e.name); }
}
// One hand case: the source, what stripJs must give (null to judge it by its tokens and its run alone), and a short name.
function jsCase(name, src, want, runs) {
    let got = null, err = null;
    try { got = S.stripJs(src); } catch (e) { err = e.message; }
    if (err) { check(name, false, 'threw: ' + err); return null; }
    const lines = S.lineCount(got) === S.lineCount(src), toks = same(src, got), shorter = got.length <= src.length;
    const exact = want === null || got === want;
    const ran = runs ? run(src) === run(got) && run(got).startsWith('ok:') : true;
    check(name, exact && lines && toks && shorter && ran, j({ got, want, lines, toks, shorter, ran: runs ? [run(src), run(got)] : '-' }));
    return got;
}

(async function() {
    /* ---- JavaScript, by hand ---- */
    jsCase('a // inside a string stays, the comment after it goes with the space before it',
        'var a = "x // y"; // gone\nvar b = 1;', 'var a = "x // y";\nvar b = 1;', true);
    jsCase('a block comment marker inside single quotes stays; a block comment between statements goes with one of the two spaces beside it',
        "var s = '/* not */ // nor'; /* gone */ var t = 1; s + t;", "var s = '/* not */ // nor';  var t = 1; s + t;", true);
    jsCase('a template literal keeps a // and a block comment marker of its own, through nested ${...} and a template inside one; the comment inside a substitution goes',
        'var t = `a // b ${ `c /* d */ ${ 1 /* e */ + 2 } //` } f`; // end\nt;', 'var t = `a // b ${ `c /* d */ ${ 1  + 2 } //` } f`;\nt;', true);
    jsCase('a } inside a string inside a substitution does not end it, an object inside a substitution is an object, and an escaped backtick is text',
        "var u = `x${ '}' + ({ k: 1 }).k }y` + `\\`//` ; // c\nu;", "var u = `x${ '}' + ({ k: 1 }).k }y` + `\\`//` ;\nu;", true);
    jsCase('a regex that holds // (escaped) keeps it, and so does one with / inside a class, with a block comment marker inside a class too',
        "var r = /" + BS + "/" + BS + "//g.source + /[/]/.source + /[/*]/.test('*'); // c\nr;", "var r = /" + BS + "/" + BS + "//g.source + /[/]/.source + /[/*]/.test('*');\nr;", true);
    jsCase('a regex whose body ends in a star before its closing slash (/a*/) is a regex, not the end of a comment',
        "var r = /a*/.source /* c */ ; r;", "var r = /a*/.source  ; r;", true);
    jsCase('division: after a name, a number, a ) of a call, a ], and across a line break that a // comment ended (the line goes on dividing)',
        'var x = 8, y = 2; var d = x / y / 2 // half\n/ 1; var e = [8][0] / Math.abs(2) / .5 / 0x10 / 1e1; [d, e];', 'var x = 8, y = 2; var d = x / y / 2\n/ 1; var e = [8][0] / Math.abs(2) / .5 / 0x10 / 1e1; [d, e];', true);
    jsCase('a regex after the ) of an if head, and a regex after the } of a block, each holding //',
        "var h = 0; if (true) /x" + BS + "/" + BS + "//.test('x//') && (h += 1); // one\n{ } /a/.test('a') && (h += 2); /* two */\nh;", null, true);
    jsCase('a division after the } of an object (an object read as an expression), and after the } of an object in a substitution',
        'var u = String([{} / 2]) + `${ {} / 2 }`; // NaN twice\nu;', 'var u = String([{} / 2]) + `${ {} / 2 }`;\nu;', true);
    jsCase('a postfix ++ is followed by a division, a prefix ++ by a name',
        'var i = 5; var p = i++ / 5 // one\n; var m = ++i / 7; [p, m];', 'var i = 5; var p = i++ / 5\n; var m = ++i / 7; [p, m];', true);
    jsCase('after return, typeof, ! and an arrow a slash begins a regex; after a property named return it divides',
        "function f() { return /re" + BS + "//.source; } var o = { return: 6 }; var g = s => /a" + BS + "/b/.test(s); [f(), typeof /x/, !/x/.test('y'), o.return / 2 / 1, g('a/b')]; // c", null, true);
    jsCase('a regex with flags is an operand: a slash after it divides',
        "var q = /a/g.lastIndex / 1 // zero\n; q;", 'var q = /a/g.lastIndex / 1\n; q;', true);
    jsCase('a #private name, a ?. before a digit (a conditional), and a class body',
        "class P { #x = 9; g() { return this.#x / 3; } } var z = true?.5:1; [new P().g(), z]; // c", null, true);
    jsCase('a hashbang line is kept as it is, and a comment under it goes',
        '#!/usr/bin/env node\n// comment\nvar hb = 1; hb;', '#!/usr/bin/env node\n\nvar hb = 1; hb;', true);
    jsCase('a /*! licence comment is kept; other comments go',
        '/*! licence: keep me */\nvar k = 1; /* gone */\nk;', '/*! licence: keep me */\nvar k = 1;\nk;', true);
    jsCase('a block comment that held line breaks leaves them, so every line below keeps its number',
        'var a = 1; /* one\ntwo\nthree */ var b = 2; a + b;', 'var a = 1;\n\n var b = 2; a + b;', true);
    jsCase('a block comment that held a line break still ends a statement where the language ends one (n, then ++n, not n++)',
        'var n = 1\nvar g = n /*\n*/ ++n; [g, n];', 'var n = 1\nvar g = n\n ++n; [g, n];', true);
    jsCase('a return followed by a comment that held a line break still returns nothing',
        'function r() { return /*\n*/ 7; } String(r());', 'function r() { return\n 7; } String(r());', true);
    jsCase('a block comment between two tokens with nothing else between them leaves one space, so typeof and a name stay two words',
        'var ab = 1; var c = typeof/**/ab; var e = ab -/**/-ab; var f = ab/*x*//*y*/+1; [c, e, f];', 'var ab = 1; var c = typeof ab; var e = ab - -ab; var f = ab +1; [c, e, f];', true);
    const hl = 'var lt = 1, hl = 3 <!--lt;\nvar gt = 2\n-->gt;\n';
    check('HTML-like comments are no comments to the stripper: a text that holds <!-- and --> and no other comment comes back unchanged', S.stripJs(hl) === hl);
    jsCase('CRLF line endings: the CR LF after a // comment stays, and a block comment that held a CR LF leaves it',
        'var a = 1; // c\r\nvar b = 2; /* x\r\ny */ var c = 3;\r\n[a, b, c];', 'var a = 1;\r\nvar b = 2;\r\n var c = 3;\r\n[a, b, c];', true);
    jsCase('a NUL byte inside a string stays where it is',
        'var s = "a' + NUL + 'b"; // c\ns.length;', 'var s = "a' + NUL + 'b";\ns.length;', true);
    jsCase('the line separator ends a // comment as the language reads it, so the statement after it is kept',
        'var a = 1; // c' + LS + 'var b = 2; [a, b];', 'var a = 1;' + LS + 'var b = 2; [a, b];', true);
    jsCase('an escaped quote and a line continuation inside strings are read through',
        "var s = 'it" + BS + "'s // not'; var t = \"a" + BS + BS + "\"; var u = 'x" + BS + "\ny'; // c\n[s, t, u];", null, true);
    jsCase('a comment at the very end with no line break after it goes, with the spaces before it',
        'var e = 5; e;   // last', 'var e = 5; e;', true);
    jsCase('a comment right after a template, and a // right after a regex with flags',
        'var a = `x`; // c\nvar b = /y/gi; // d\n[a, b.source];', 'var a = `x`;\nvar b = /y/gi;\n[a, b.source];', true);
    jsCase('a line that held only a comment is left empty, its indentation gone',
        'function f() {\n    // just a note\n    return 1;\n}\nf();', 'function f() {\n\n    return 1;\n}\nf();', true);
    const nc = 'var plain = "no comments here"; plain;\n';
    check('a text with no comment comes back as the very same string', S.stripJs(nc) === nc);
    let threw = '';
    try { S.stripJs('var s = "never ends;\n'); } catch (e) { threw = e.message; }
    check('a string that runs past its line is refused with its line named, never stripped', /string.*line 1/.test(threw), threw);
    threw = '';
    try { S.stripJs('var a = 1;\n/* never ends'); } catch (e) { threw = e.message; }
    check('a block comment that never ends is refused with its line named', /block comment.*line 2/.test(threw), threw);
    check('the tokenizer reads a name with a unicode escape, a BigInt, numeric separators and a spread as single tokens',
        j(tokv('var ' + BS + 'u0061b = 3_000n; f(...x);')) === j(['var', BS + 'u0061b', '=', '3_000n', ';', 'f', '(', '...', 'x', ')', ';']), j(tokv('var ' + BS + 'u0061b = 3_000n; f(...x);')));
    check('the tokens say which follow a line break, and a comment that held one counts as one',
        j(S.jsTokens('a /*\n*/ b // c\nd').map(t => t.nl)) === j([false, true, true]));
    check('latin1 reading: a byte of 0x80 or more is part of a name, and only LF and CR end a line',
        j(S.jsTokens('a' + String.fromCharCode(0xE9) + 'b // c' + String.fromCharCode(0xE2, 0x80, 0xA8) + 'd', { bytes: true }).map(t => t.v)) === j(['a' + String.fromCharCode(0xE9) + 'b']));

    /* ---- CSS, by hand ---- */
    const cssCase = (name, src, want) => {
        const got = S.stripCss(src);
        const ok = got === want && S.lineCount(got) === S.lineCount(src) && j(S.cssTokens(got)) === j(S.cssTokens(src)) && got.length <= src.length;
        check(name, ok, j({ got, want }));
    };
    cssCase('a comment after a rule goes with the space before it', 'a { color: red; } /* c */\nb { }', 'a { color: red; }\nb { }');
    cssCase('a comment marker inside a string stays', 'a::before { content: "/* not */"; } /* c */', 'a::before { content: "/* not */"; }');
    cssCase('an unquoted url(...) holding a comment marker stays whole', 'b { background: url(data:image/svg+xml;utf8,<svg/*x*/>); } /* c */', 'b { background: url(data:image/svg+xml;utf8,<svg/*x*/>); }');
    cssCase('a quoted url("...") holding a comment marker stays', 'c { background: url("a/*b*/c.png"); }', 'c { background: url("a/*b*/c.png"); }');
    cssCase('a /*! licence comment is kept', '/*! licence */\nd { }', '/*! licence */\nd { }');
    cssCase('a comment between two words with no space is kept, since taking it out would make one word (div and p)', 'div/**/p { }', 'div/**/p { }');
    cssCase('a comment beside a colon goes (x:hover)', 'x:/**/hover { }', 'x:hover { }');
    cssCase('a comment between ~ and = is kept, since ~= is one token', '[a~/**/=b] { }', '[a~/**/=b] { }');
    cssCase('a comment that held line breaks leaves them', 'e { color: red; /* one\ntwo */ margin: 0; }', 'e { color: red;\n margin: 0; }');
    cssCase('a comment that stood alone on its line leaves the line empty', 'f {\n    /* note */\n    top: 0;\n}', 'f {\n\n    top: 0;\n}');

    /* ---- HTML, by hand ---- */
    const htmlCase = (name, src, want) => {
        const got = S.stripHtml(src);
        const ok = got === want && S.lineCount(got) === S.lineCount(src) && j(S.htmlSig(got)) === j(S.htmlSig(src)) && got.length <= src.length;
        check(name, ok, j({ got, want }));
    };
    htmlCase('a comment inside text goes, the spaces beside it stay', '<p>a <!-- x --> b</p>', '<p>a  b</p>');
    htmlCase('a comment alone on its line leaves the line empty', '<div>\n  <!-- note -->\n</div>', '<div>\n\n</div>');
    htmlCase('a comment marker inside an attribute value stays', '<a title="<!-- keep -->" data-x=\'<!--\'>x</a>', '<a title="<!-- keep -->" data-x=\'<!--\'>x</a>');
    htmlCase('pre and textarea keep their contents as they are', '<pre><!-- keep --></pre><textarea><!-- k --></textarea>', '<pre><!-- keep --></pre><textarea><!-- k --></textarea>');
    htmlCase('an inline classic script goes through stripJs, its "<!--" a string', '<script>var a = "<!--"; // c\n</script>', '<script>var a = "<!--";\n</script>');
    htmlCase('an inline module goes through stripJs too', '<script type="module">export {}; /* c */\n</script>', '<script type="module">export {};\n</script>');
    htmlCase('a script of another type is left as it is', '<script type="text/template"><!-- k --> // k</script>', '<script type="text/template"><!-- k --> // k</script>');
    htmlCase('an inline style goes through stripCss', '<style>/* c */ a { }</style>', '<style> a { }</style>');
    htmlCase('a <!--! comment and the doctype are kept', '<!DOCTYPE html>\n<!--! keep -->\n<p>x</p>', '<!DOCTYPE html>\n<!--! keep -->\n<p>x</p>');
    htmlCase('a comment that held line breaks leaves them where white space stands beside it', '<p>a <!-- one\ntwo\nthree -->b</p>', '<p>a \n\nb</p>');
    htmlCase('a comment that held line breaks between two words, or between two tags, is emptied and kept, since its line breaks alone would put a space between them',
        '<p>a<!-- one\ntwo -->b</p><b>x</b><!--\nc\n--><i>y</i>', '<p>a<!--\n-->b</p><b>x</b><!--\n\n--><i>y</i>');

    /* ---- stripTree on a tree of its own ---- */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-stripcheck-'));
    try {
        const src = path.join(tmp, 'src');
        const put = (rel, data) => { const f = path.join(src, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
        put('index.html', '<!doctype html>\n<!-- page -->\n<script src="scripts/boot.js"></script>\n<script src="/api/prefs.js"></script>\n<script type="module" src="scripts/m.js"></script>\n');
        put('scripts/boot.js', '/* boot */\nvar boot = 1; // c\n');
        put('scripts/m.js', 'import { b } from "./b.js"; // c\nexport const a = b / 2; /* d */\nawait 0;\n');
        put('scripts/b.js', 'export const b = 4;\n');
        put('scripts/nul.js', 'export const sep = "' + NUL + '"; // sig\nexport const t = 1;\n');
        put('style.css', '/* top */\na { }\n');
        put('data.json', '{ "a": "// not a comment", "b": "/* nor */" }\n');
        put('assets/vendor/lib.js', '/* licence of the library */\nvar lib = 1; // kept\n');
        put('assets/vendor/lib.css', '/* kept */ a { }\n');
        put('assets/fonts/x.ttf', Buffer.from([0, 1, 2, 47, 42, 3, 42, 47, 255, 254]));
        put('assets/pic.png', Buffer.from([137, 80, 78, 71, 47, 47, 10, 0]));
        // a file that is not UTF-8: its 0xFF byte inside a string must come back as it was
        put('scripts/latin.js', Buffer.concat([Buffer.from('export const s = "'), Buffer.from([0xFF, 0xFE]), Buffer.from('"; // c\n')]));
        const out = path.join(tmp, 'out');
        const rep = S.stripTree(src, out);
        const B = rel => fs.readFileSync(path.join(out, rel)), A = rel => fs.readFileSync(path.join(src, rel));
        check('stripTree copies the whole tree, stripping the five scripts, the style sheet and the page', rep.files === 12 && rep.stripped.length === 7 && rep.copied === 5, j(rep));
        check('the vendor folder, the font folder, JSON and a picture come out byte for byte',
            ['assets/vendor/lib.js', 'assets/vendor/lib.css', 'assets/fonts/x.ttf', 'assets/pic.png', 'data.json'].every(r => A(r).equals(B(r))));
        check('a script the page loads with no type="module" is judged as a classic script, the rest as modules, and an address outside the tree is no file',
            j(rep.stripped.filter(x => x.kind === 'classic').map(x => x.file)) === j(['scripts/boot.js']) && j([...S.classicScripts(src, ['index.html'])]) === j(['scripts/boot.js']));
        check('the stripped files are what stripJs, stripCss and stripHtml give',
            B('scripts/boot.js').toString() === '\nvar boot = 1;\n' && B('scripts/m.js').toString() === 'import { b } from "./b.js";\nexport const a = b / 2;\nawait 0;\n'
            && B('style.css').toString() === '\na { }\n' && B('index.html').toString() === '<!doctype html>\n\n<script src="scripts/boot.js"></script>\n<script src="/api/prefs.js"></script>\n<script type="module" src="scripts/m.js"></script>\n',
            j([B('scripts/boot.js').toString(), B('style.css').toString()]));
        check('a NUL byte inside a string comes out where it was', B('scripts/nul.js').toString() === 'export const sep = "' + NUL + '";\nexport const t = 1;\n');
        check('a file that is not UTF-8 is read and written as latin1, so its own bytes come back as they were',
            B('scripts/latin.js').equals(Buffer.concat([Buffer.from('export const s = "'), Buffer.from([0xFF, 0xFE]), Buffer.from('";\n')])));
        check('the report counts the bytes before and after and what was saved', rep.saved === rep.before - rep.after && rep.saved > 0 && rep.stripped.every(x => x.after <= x.before));
        const refusal = (name, opts, srcEdit, pat) => {
            const o = path.join(tmp, 'o' + Math.random().toString(36).slice(2));
            let msg = '';
            const undo = srcEdit ? srcEdit() : null;
            try { S.stripTree(src, o, opts); } catch (e) { msg = e.message; }
            if (undo) undo();
            check(name, pat.test(msg), msg || 'no refusal');
        };
        refusal('a stripped file that grew is refused, the file named', { stripJs: t => t + ' ' }, null, /^stripTree refused scripts\/\S+\.js: it grew from/);
        refusal('a stripped file that lost a line is refused, the file named', { stripJs: t => t.replace('\n', '') }, null, /^stripTree refused scripts\/\S+\.js: it went from \d+ lines to/);
        refusal('a stripped file whose tokens differ from the source\'s is refused, the token named', { stripJs: t => t.replace(/b/, 'c') }, null, /^stripTree refused scripts\/\S+\.js: its tokens differ .*token \d+ was/);
        refusal('a stripped style sheet whose tokens differ is refused', { stripCss: t => t.replace('a', 'b') }, null, /^stripTree refused style\.css: its tokens differ/);
        refusal('a stripped page whose markup differs is refused', { stripHtml: t => t.replace('/api/prefs.js', '/api/prefs.jz') }, null, /^stripTree refused index\.html: its markup differs/);
        const swap = (rel, text) => () => { const f = path.join(src, rel), was = fs.readFileSync(f); fs.writeFileSync(f, text); return () => fs.writeFileSync(f, was); };
        refusal('a module that does not parse as a module is refused, by V8\'s own parser', null, swap('scripts/b.js', 'export const b = ;\n'), /^stripTree refused scripts\/b\.js: it no longer parses as a module/);
        refusal('a classic script that holds an import (module-only syntax) is refused as a classic script', null, swap('scripts/boot.js', 'import x from "./b.js"; // c\n'), /^stripTree refused scripts\/boot\.js: it no longer parses as a classic script/);
        refusal('a file the tokenizer cannot read is refused, never stripped', null, swap('scripts/b.js', 'export const b = "open;\n'), /^stripTree refused scripts\/b\.js: it could not be read/);
        let m1 = '', m2 = '';
        try { S.stripTree(src, out); } catch (e) { m1 = e.message; }
        try { S.stripTree(src, path.join(src, 'inner')); } catch (e) { m2 = e.message; }
        check('stripTree refuses a copy folder that is not empty, and one inside the source', /is not empty/.test(m1) && /inside each other/.test(m2), j([m1, m2]));
        const bad = S.parseModules([path.join(src, 'scripts', 'b.js')]);
        check('parseModules answers nothing for a module that parses', j(bad) === '{}', j(bad));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

    /* ---- a seeded fuzz of generated JavaScript ---- */
    // mulberry32: a small seeded generator, so a failure can be made again from its seed
    function rng(seed) { let a = seed >>> 0; return function() { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    const pick = (R, xs) => xs[Math.floor(R() * xs.length)];
    const REGEXES = ['/a' + BS + '/' + BS + '//', '/[/*]/', '/x*/g', '/' + BS + '/' + BS + '*/', '/[' + BS + ']/]/', '/' + BS + '//', '/a|b/i', '/[*/]+/', '/(?:a)*/', '/[//]/'];
    const STR_BITS = ['//', '/*', '*/', 'a', ' ', BS + BS, '`', '${', '<!--', '-->', '#', '}'];
    function strTok(R) { const q = pick(R, ["'", '"']); let s = ''; const k = 1 + Math.floor(R() * 4); for (let i = 0; i < k; i++) s += R() < 0.15 ? BS + q : pick(R, STR_BITS); return q + s + q; }
    function tplBit(R) { let s = ''; const k = Math.floor(R() * 3); for (let i = 0; i < k; i++) s += pick(R, ['//', '/*', '*/', 'q', ' ', BS + '`', BS + '${', '{']); return s; }
    const T = (v, f) => (f ? Object.assign({ v }, f) : { v });
    const rx = (R) => T(pick(R, REGEXES));
    function atom(R) {
        const k = Math.floor(R() * 6);
        if (k === 0) return [T(pick(R, ['1', '2', '7', '2.5', '.5', '0x10', '1e2', '3_000']))];
        if (k === 1) return [T(strTok(R))];
        if (k === 2) return pick(R, [[T('a')], [T('b')], [T('o'), T('.'), T('k')], [T('arr'), T('['), T('1'), T(']')]]);
        if (k === 3) return R() < 0.5 ? [rx(R), T('.'), T('source')] : [rx(R), T('.'), T('test'), T('('), T(strTok(R)), T(')')];
        if (k === 4) return [T('`' + tplBit(R) + '`')];
        return [T('('), T('i'), T('++', { noNlBefore: true }), T('/'), T('2'), T(')')];
    }
    function expr(R, d) {
        if (d <= 0) return atom(R);
        const k = Math.floor(R() * 11), E = () => expr(R, d - 1);
        switch (k) {
            case 0: case 1: return [...E(), T(pick(R, ['+', '-', '*', '/', '%', '<', '===', '&&', '||', '??'])), ...E()];
            case 2: return [T(pick(R, ['!', '-', 'typeof', 'void'])), ...E()];
            case 3: return [T('('), ...E(), T(')')];
            case 4: return [T('`' + tplBit(R) + '${'), ...E(), T('}' + tplBit(R) + '`')];
            case 5: return [T('`a${'), T('`b${'), ...E(), T('}c`'), T('}d`')];
            case 6: return [T('('), T('{'), T('k'), T(':'), ...E(), T('}'), T(')'), T('.'), T('k')];
            case 7: return [T('['), T('{'), T('}'), T('/'), T('2'), T(']'), T('.'), T('length')];
            case 8: return [T('('), T('('), T(')'), T('=>', { noNlBefore: true }), T('{'), T('return', { noNlAfter: true }), ...E(), T(';'), T('}'), T(')'), T('('), T(')')];
            case 9: return [T('('), ...E(), T('?'), ...E(), T(':'), ...E(), T(')')];
            default: return pick(R, [[T('typeof'), rx(R)], [T('!'), rx(R), T('.'), T('test'), T('('), T(strTok(R)), T(')')], [T('o'), T('.'), T('return'), T('/'), T('2')]]);
        }
    }
    function statement(R, n) {
        const k = Math.floor(R() * 6);
        if (k === 0) return [T('if'), T('('), T('true'), T(')'), rx(R), T('.'), T('test'), T('('), T(strTok(R)), T(')'), T('&&'), T('r'), T('.'), T('push'), T('('), T('1'), T(')'), T(';')];
        if (k === 1) return [T('{'), T('}'), rx(R), T('.'), T('test'), T('('), T(strTok(R)), T(')'), T('&&'), T('r'), T('.'), T('push'), T('('), T('2'), T(')'), T(';')];
        if (k === 2) return [T('function'), T('f' + n), T('('), T(')'), T('{'), T('return', { noNlAfter: true }), rx(R), T('.'), T('source'), T(';'), T('}'), T('r'), T('.'), T('push'), T('('), T('f' + n), T('('), T(')'), T(')'), T(';')];
        return [T('r'), T('.'), T('push'), T('('), ...expr(R, 1 + Math.floor(R() * 3)), T(')'), T(';')];
    }
    const SEPS = [' ', ' ', ' ', ' ', '  ', '\t', '\n', '\r\n', ' /* CMT */ ', '/*CMT*/', '// CMT\n', '/* CMT\nCMT */', ' /*! KEEP */ ', '/**/', '\t// CMT\r\n'];
    const SEPS_FLAT = [' ', '\t', '/*CMT*/', ' /* CMT */ ', '/**/', ' /*! KEEP */ '];
    function program(R) {
        const toks = [T('var'), T('r'), T('='), T('['), T(']'), T(','), T('a'), T('='), T('7'), T(','), T('b'), T('='), T('3'), T(','), T('i'), T('='), T('4'),
            T(','), T('o'), T('='), T('{'), T('k'), T(':'), T('5'), T(','), T('return'), T(':'), T('6'), T('}'), T(','), T('arr'), T('='), T('['), T('1'), T(','), T('2'), T(']'), T(';')];
        const k = 2 + Math.floor(R() * 5);
        for (let n = 0; n < k; n++) toks.push(...statement(R, n));
        toks.push(T('JSON'), T('.'), T('stringify'), T('('), T('r'), T(')'), T(';'));
        let src = R() < 0.1 ? '#!hb\n' : '';
        toks.forEach((t, x) => {
            src += t.v;
            const nx = toks[x + 1];
            if (!nx) return;
            const sep = (t.noNlAfter || nx.noNlBefore) ? pick(R, SEPS_FLAT) : pick(R, SEPS);
            src += (/\/$/.test(t.v) && sep[0] === '/') ? ' ' + sep : sep;   // a division's slash right before a comment's would make a // comment
        });
        return { src, vals: toks.map(t => t.v) };
    }
    const FUZZ = 1500;
    let fuzzBad = null, okRuns = 0, cuts = 0;
    for (let s = 1; s <= FUZZ && !fuzzBad; s++) {
        const R = rng(s * 7919), p = program(R);
        let out;
        try { out = S.stripJs(p.src); } catch (e) { fuzzBad = { seed: s, why: 'threw ' + e.message, src: p.src }; break; }
        cuts += S.scanJs(p.src).cuts.length;
        const srcVals = tokv(p.src), outVals = tokv(out);
        const ranA = run(p.src), ranB = run(out);
        if (ranA.startsWith('ok:')) okRuns++;
        const why = j(srcVals) !== j(p.vals) ? 'the source was read into other tokens than the generator wrote'
            : j(outVals) !== j(p.vals) ? 'the stripped program has other tokens than the generator wrote'
            : !same(p.src, out) ? 'the line breaks between tokens differ'
            : ranA !== ranB ? 'V8 ran the two to different ends: ' + ranA.slice(0, 80) + ' / ' + ranB.slice(0, 80)
            : /CMT/.test(out) ? 'a comment was left in'
            : (out.match(/KEEP/g) || []).length !== (p.src.match(/KEEP/g) || []).length ? 'a /*! comment was lost'
            : S.lineCount(out) !== S.lineCount(p.src) ? 'a line was lost'
            : out.length > p.src.length ? 'it grew' : null;
        if (why) fuzzBad = { seed: s, why, src: p.src, out };
    }
    check('a seeded fuzz of ' + FUZZ + ' generated programs: each source is read into the very tokens the generator wrote, the stripped program has them too with the same line breaks between them, V8 runs both to the same result, no comment is left and every /*! kept, no line lost, nothing grew',
        !fuzzBad, fuzzBad && j(fuzzBad));
    check('the fuzz meant something: nearly every generated program runs, and they held thousands of comments', okRuns >= FUZZ * 0.95 && cuts > FUZZ * 20, j({ okRuns, cuts }));

    // a seeded fuzz of CSS: words, punctuation, strings and url(...) with comments between them
    let cssBad = null;
    const CSS_ATOMS = ['div', 'p', '.x', '#y', 'a:hover', '{', '}', ':', ';', ',', '>', '[', ']', 'color', 'red', '"/* s */"', "'//'", 'url(a/*b*/c.png)', 'url("/*q*/")', '12px', '-webkit-x', '~=', '+', '*'];
    const CSS_SEPS = [' ', '\n', '/* CMT */', ' /* CMT */ ', '/*CMT*/', '/* CMT\nCMT */', ' /*! KEEP */ ', '\t'];
    for (let s = 1; s <= 600 && !cssBad; s++) {
        const R = rng(s * 104729);
        let src = '';
        const k = 5 + Math.floor(R() * 20);
        for (let n = 0; n < k; n++) src += pick(R, CSS_ATOMS) + pick(R, CSS_SEPS);
        const out = S.stripCss(src);
        const why = j(S.cssTokens(out)) !== j(S.cssTokens(src)) ? 'the tokens differ' : S.lineCount(out) !== S.lineCount(src) ? 'a line was lost'
            : out.length > src.length ? 'it grew' : (out.match(/KEEP/g) || []).length !== (src.match(/KEEP/g) || []).length ? 'a /*! comment was lost' : null;
        if (why) cssBad = { seed: s, why, src, out };
    }
    check('a seeded fuzz of 600 style sheets: tokens and white space between them the same after the strip, no line lost, every /*! kept, nothing grew', !cssBad, cssBad && j(cssBad));

    /* ---- the real app ---- */
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-stripapp-'));
    try {
        const copy = path.join(tmp2, 'app'), out = path.join(tmp2, 'out');
        fs.cpSync(APP, copy, { recursive: true, filter: (f) => path.relative(APP, f).split(path.sep)[0] !== 'private' });
        let rep = null, err = '';
        try { rep = S.stripTree(copy, out); } catch (e) { err = e.message; }
        check('stripTree takes the real app (a copy of system/app) without a refusal: every stripped script parses as its kind by V8, its tokens are the source\'s, no line is lost and nothing grew', !!rep, err);
        if (rep) {
            const all = S.listTree(copy);
            const js = rep.stripped.filter(x => x.kind === 'module' || x.kind === 'classic');
            check('every .js of the app outside the vendor folder was stripped, every style sheet and page too, and nothing of the vendor or font folders',
                all.filter(r => /\.(js|css|html)$/.test(r) && !S.KEEP_DIRS.some(d => r.startsWith(d + '/'))).length === rep.stripped.length
                && !rep.stripped.some(x => S.KEEP_DIRS.some(d => x.file.startsWith(d + '/'))), rep.stripped.length);
            check('the classic scripts are index.html\'s own: the four boot scripts and tooltips.js; every other script is a module',
                j(js.filter(x => x.kind === 'classic').map(x => x.file).sort()) === j(['scripts/bootdiagram.js', 'scripts/booterror.js', 'scripts/bootprefs.js', 'scripts/boottheme.js', 'scripts/tooltips.js']));
            let badImport = [];
            for (const x of js.filter(x => x.kind === 'module')) {
                try { await import(pathToFileURL(path.join(out, x.file)).href); }
                catch (e) { if (e instanceof SyntaxError) badImport.push(x.file + ': ' + e.message); }
            }
            check('every stripped module loads as parsecheck loads one (imported for real: a syntax error fails, a runtime error of a page with no window is fine)', badImport.length === 0, j(badImport));
            const tokBad = [], lineBad = [], left = [], sameBad = [];
            for (const x of js) {
                const a = S.decode(fs.readFileSync(path.join(copy, x.file))), b = S.decode(fs.readFileSync(path.join(out, x.file)));
                const o = { bytes: a.enc === 'latin1' };
                if (j(S.jsTokens(a.text, o)) !== j(S.jsTokens(b.text, o))) tokBad.push(x.file);
                if (S.lineCount(a.text) !== S.lineCount(b.text)) lineBad.push(x.file);
                if (S.scanJs(b.text, o).cuts.length) left.push(x.file);
                if (!x.comments && !fs.readFileSync(path.join(copy, x.file)).equals(fs.readFileSync(path.join(out, x.file)))) sameBad.push(x.file);
            }
            check('file by file, the token stream of each stripped script is its source\'s, with the same line breaks between tokens, and the same number of lines', tokBad.length === 0 && lineBad.length === 0, j([tokBad, lineBad]));
            check('no comment is left in any stripped script, and a script that held none comes out byte for byte', left.length === 0 && sameBad.length === 0, j([left, sameBad]));
            const copied = all.filter(r => !rep.stripped.some(x => x.file === r));
            const diff = copied.filter(r => !fs.readFileSync(path.join(copy, r)).equals(fs.readFileSync(path.join(out, r))));
            check('the vendor folder, the font folder and every file that is not stripped (JSON, pictures, sounds, fonts, licence texts) come out byte for byte',
                diff.length === 0 && copied.some(r => r.startsWith('assets/vendor/')) && copied.some(r => r.startsWith('assets/fonts/')), j(diff));
            const vendor = fs.readFileSync(path.join(out, 'assets', 'vendor', 'peerjs.min.js'), 'utf8');
            check('a bundled library keeps its own comments (its licence header among them)', /\/\*|\/\//.test(vendor));
            const nuls = f => (fs.readFileSync(path.join(out, 'scripts', f)).toString('latin1').match(/\x00/g) || []).length;
            const nulsWas = f => (fs.readFileSync(path.join(copy, 'scripts', f)).toString('latin1').match(/\x00/g) || []).length;
            check('the NUL bytes of docpanel.js (its three signature separators), popout.js and net.js come out where they were', nuls('docpanel.js') === 3 && nulsWas('docpanel.js') === 3 && nuls('popout.js') === nulsWas('popout.js') && nuls('net.js') === nulsWas('net.js'));
            const grew = rep.stripped.filter(x => x.after > x.before);
            check('no stripped file grew, and the app is smaller', grew.length === 0 && rep.saved > 0, j(grew));
            const by = k => rep.stripped.filter(x => x.kind === k).reduce((s, x) => s + (x.before - x.after), 0);
            console.log('info      the real app: ' + rep.stripped.length + ' files stripped (' + js.length + ' scripts, ' + rep.stripped.filter(x => x.kind === 'css').length + ' style sheet, '
                + rep.stripped.filter(x => x.kind === 'html').length + ' page), ' + rep.before + ' bytes before, ' + rep.after + ' after, ' + rep.saved + ' saved ('
                + (100 * rep.saved / rep.before).toFixed(1) + '%): scripts ' + (by('module') + by('classic')) + ', style sheet ' + by('css') + ', page ' + by('html'));
        }
    } finally { fs.rmSync(tmp2, { recursive: true, force: true }); }

    /* ---- wired ---- */
    const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'checks.yml'), 'utf8').replace(/\r\n/g, '\n');
    check('CI runs this suite', yml.includes('        run: node tools/stripcheck.js\n'));
    check('stripcore.js stands on Node alone and exports what the release tool will call', !/require\((?!'(fs|path|vm|os|child_process)')/.test(fs.readFileSync(path.join(__dirname, 'stripcore.js'), 'utf8')) && typeof S.stripTree === 'function');

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exitCode = 1;
})().catch(function(e) { console.log('FAIL      ' + (e && e.stack || e)); summed = true; process.exitCode = 1; });

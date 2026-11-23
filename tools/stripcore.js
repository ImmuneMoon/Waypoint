/* tools/stripcore.js: takes the comments out of the app's own JavaScript, CSS and HTML for a release build, and keeps every name.

   Why it is here (the manager's inquiry of 2026-11-16, for the December release): the installed front end is plain files anyone can
   open, and its comments are the most useful map of it to someone reading it. A release build therefore strips them. Names stay as
   they are, since an error report names a function and whoever reads a crash must be able to find it.

   What it does, in short:
   - stripJs(text) removes // and block comments from JavaScript. It reads the file with a real tokenizer (strings in all three
     quotes, template literals with nested ${...}, regular-expression literals told from division by the token before), so a // inside
     a string, a template or a regex is never taken for a comment. Every line break stays, so a line number in an error report still
     points at the same line of the source. A comment that begins with /*! (a licence) is kept. A hashbang line is kept. HTML-like
     comments (<!-- anywhere, and --> at the start of a line) are comments in a classic script, as V8 reads them: with opts.classic
     they are kept whole, nothing inside them cut. In a module they are code, and are read as code.
   - stripCss(text) removes block comments outside strings and url(...).
   - stripHtml(text) removes <!-- --> comments outside the elements whose contents are not markup (script, style, title, textarea,
     xmp, iframe, noembed, noframes, noscript, plaintext, and pre, which is markup but is never touched) and outside attribute values.
     A comment is read as the HTML tokenizer reads one, and only an ordinary one is taken out (see stripHtml). An inline <script> or
     <style> (index.html has none, by house rule) goes through stripJs or stripCss.
   - stripTree(srcDir, outDir) copies a tree, stripping what may be stripped, and REFUSES (throws, naming the file) where a stripped
     JavaScript file no longer parses as the kind it was, where its tokens differ from the source's in any way other than the comments,
     where a file lost or gained a line, or where a file grew. Beside those checks, which stand on this file's own tokenizer, it asks
     an independent one: acorn, the JavaScript parser Node bundles for its own use (see acornCheck), must find exactly the comments
     the tokenizer found in each source, and the very same tokens with the same line breaks between them in the source and in the
     stripped copy. So a misreading of the tokenizer, which would look the same on both sides of its own check, is refused. Each
     page's removed comments are checked apart from the reader that found them too (see htmlRemovedSays). The release tool will
     call it; tools/stripcheck.js holds it.

   What it never touches: system/app/assets/vendor (the bundled libraries keep their licence headers), system/app/assets/fonts, JSON,
   and every file that is not .js, .css or .html. The core (system/resources/app) is not stripped: it is small, the installer's
   signature covers it, and the release tool does not hand it to stripTree.

   Bytes: a style sheet or a page is read as UTF-8 only where that reading writes back the very same bytes, and as latin1 otherwise,
   so every byte that is no part of a comment comes out as it went in. A .js file that is not exact UTF-8 is refused: the app serves
   its scripts as UTF-8, and read as latin1 a line separator (the bytes E2 80 A8) would be no line break to the tokenizer while the
   browser ends a // comment there. docpanel.js holds three NUL bytes (its signature separators) inside strings, and they come out
   untouched. Nothing here depends on anything but Node itself (acorn is Node's own copy, reached with --expose-internals). */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const { spawnSync } = require('child_process');

/* ---------- JavaScript ---------- */

// The keywords after which a slash begins a regular expression rather than a division (`return /x/.test(s)`, `export default /x/`). A
// keyword used as a property name (`a.return / 2`) is a name like any other, which the tokenizer tells by the token before it. `of` is
// no keyword of this list, since it is an ordinary name outside a for head; scanJs marks the `of` of `for (x of /re/)` itself.
const REGEX_KW = new Set(['return', 'typeof', 'instanceof', 'in', 'new', 'delete', 'void', 'throw', 'case', 'default', 'do', 'else', 'yield', 'await']);
// The keywords after which a { opens an object (an expression) rather than a block: `return { a: 1 }`, `export default { a: 1 }`.
// `else {`, `do {`, `try {` are blocks. (`default` before a { is always `export default`: a switch's default is followed by a colon.)
const EXPR_KW = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'default', 'yield', 'await']);
// The punctuators after which a { opens a block: a function or if body after `)`, an arrow body after `=>`, a statement after `;`, `{` or `}`.
// A colon is decided by scanJs itself: after a label or a switch clause's colon a { is a block, after any other colon an object.
const BLOCK_AFTER = new Set([')', ']', '}', ';', '{', '=>']);
// The keywords whose ( opens a control head: the `)` that closes it may be followed by a regex (`if (x) /re/.test(s)`). The ( of
// `for await (` is one too (scanJs tells it by the `for` before the `await`).
const CTRL_KW = new Set(['if', 'while', 'for', 'with']);
// Every punctuator longer than one character, longest first, so the scan always takes the longest that matches.
const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.',
    '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**'];

// A line terminator in JavaScript: LF, CR, and the line and paragraph separators. (A .js file is always read as UTF-8: stripTree
// refuses one that is not, so a separator is always one character here.)
function jsLT(c) { return c === 10 || c === 13 || c === 0x2028 || c === 0x2029; }
// White space in JavaScript that is not a line terminator.
function jsWS(c) {
    if (c === 9 || c === 11 || c === 12 || c === 32) return true;
    return c === 0xA0 || c === 0xFEFF || c === 0x1680 || (c >= 0x2000 && c <= 0x200A) || c === 0x202F || c === 0x205F || c === 0x3000;
}
function isDigit(c) { return c >= 48 && c <= 57; }
// A character that may stand inside a name: ASCII letters, digits, $ and _, and any non-ASCII character that is not white space or a
// line terminator (Unicode letters, ZWNJ and ZWJ; whether a name is a legal one is the parser's to judge, not this scan's).
function jsIdPart(c) {
    return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || isDigit(c) || c === 36 || c === 95 || (c >= 0x80 && !jsWS(c) && !jsLT(c));
}
function jsIdStart(c) { return jsIdPart(c) && !isDigit(c); }

/* scanJs(src, opts) is the tokenizer every other JavaScript function here stands on. It walks the text once and answers
   { toks, cuts, keeps }:
   - toks: every token but the comments, each { t, v, nl } where t is its kind ('id' a name or keyword, 'num', 'str', 'tpl' a piece of a
     template literal, 're' a regular expression, 'p' a punctuator), v its exact text, and nl whether a line terminator stood between
     it and the token before (in white space or inside a comment). nl matters because a line break can end a statement (automatic
     semicolon insertion), so a strip that dropped one would change the program; the token check compares it too.
   - cuts: the comments to remove, each { s, e, nl, line } (its start and end, whether it holds a line terminator, and whether it is a
     // comment).
   - keeps: the comments that stay, each { s, e }: a /*! licence, a hashbang line, and in a classic script an HTML-like comment. With
     cuts they are every comment of the text, which is what acornCheck holds against Node's own parser.
   opts.classic says the text is a classic script, where `<!--` anywhere and `-->` at the start of a line (only white space and
   comments before it on its line, or nothing before it in the file) begin a comment to the end of the line, as V8 reads them. Such a
   comment is kept whole: nothing inside it is cut, since a block comment marker inside one is no marker. In a module both are code.
   An unterminated string, template, regex or block comment throws, naming its line, so a file the scan cannot read is never stripped.

   How a slash is told from a division, and a { that opens a block from one that opens an object, is by the token before (see
   regexOk and braceKind). Two things need more than that token, and the scan keeps a stack of what is open (`nest`) for them:
   - a colon: each open bracket counts the ? of conditionals inside it, so a colon that answers a ? is a conditional's, and a colon
     with no ? to answer, directly inside a block (or at the top), ends a label or a switch's case or default clause. After that
     colon a { opens a block (`case 1: { }` then `/re/` is a regex after a block), and after any other an object;
   - a for head: the ( after `for` (or `for await`) is marked, so an `of` directly inside it that follows a name, a ] or a } is the
     keyword, after which a slash begins a regex. */
function scanJs(src, opts) {
    const classic = !!(opts && opts.classic);
    const n = src.length;
    const toks = [], cuts = [], keeps = [];
    const braces = [];   // for each open {: 'b' a block, 'e' an object (expression), 't' a template substitution ${
    const parens = [];   // for each open (: true where it is the head of if / while / for / with
    const nest = [{ k: 'b', q: 0 }];   // every open ( [ { ${, innermost last: its kind ('(' 'f' a for head, '[' 'b' 'e' 't') and its open ? count
    let i = 0, nl = false, prev = null;
    const at = k => src.charCodeAt(k);
    const fail = (what, k) => { throw new Error(what + ' at line ' + (src.slice(0, k).split(/\r\n|\r|\n|\u2028|\u2029/).length)); };
    const push = (t, v, more) => { const tok = { t, v, nl }; if (more) Object.assign(tok, more); toks.push(tok); prev = tok; nl = false; };
    const open = k => nest.push({ k, q: 0 });
    const close = () => { if (nest.length > 1) nest.pop(); };
    // Whether a / here begins a regular expression, by the token before it. After a name, a number, a string, a closed template, a `)`
    // that closes an ordinary call or group, a `]`, or a `}` that closes an object, it is a division; after an operator, `(`, `,`, a
    // keyword such as return, a `)` that closes an if head, or a `}` that closes a block, it begins a regex.
    const regexOk = () => {
        if (!prev) return true;
        switch (prev.t) {
            case 'num': case 'str': case 're': return false;
            case 'tpl': return !!prev.open;
            case 'id': return !prev.prop && (REGEX_KW.has(prev.v) || !!prev.kw);
            default:
                if (prev.v === ')') return !!prev.ctrl;
                if (prev.v === ']') return false;
                if (prev.v === '}') return !!prev.block;
                if (prev.v === '++' || prev.v === '--') return !prev.post;
                return true;
        }
    };
    // What a { opens, by the token before it (see EXPR_KW and BLOCK_AFTER, and the colon in the note above).
    const braceKind = () => {
        if (!prev) return 'b';
        if (prev.t === 'tpl') return prev.open ? 'e' : 'b';
        if (prev.t === 'id') return (!prev.prop && (EXPR_KW.has(prev.v) || prev.kw)) ? 'e' : 'b';
        if (prev.t === 'p') { if (prev.v === ':') return prev.stmt ? 'b' : 'e'; return BLOCK_AFTER.has(prev.v) ? 'b' : 'e'; }
        return 'b';
    };
    // Whether a ++ or -- here follows an operand (postfix, `i++ / 2`) rather than standing before one (prefix). A line break before it
    // makes it a prefix, as the language reads it.
    const postfix = () => {
        if (!prev || nl) return false;
        if (prev.t === 'num' || prev.t === 'str' || prev.t === 're') return true;
        if (prev.t === 'tpl') return !prev.open;
        if (prev.t === 'id') return prev.prop || (!REGEX_KW.has(prev.v) && !prev.kw);
        return prev.v === ')' || prev.v === ']';
    };
    // One piece of a template literal, from its ` or the } that ends a substitution, to its closing ` or the ${ of the next substitution.
    const tplPiece = s => {
        let j = s + 1;
        for (;;) {
            if (j >= n) fail('a template literal that never ends', s);
            const c = at(j);
            if (c === 92) { j += 2; continue; }
            if (c === 96) return { e: j + 1, open: false };
            if (c === 36 && at(j + 1) === 123) return { e: j + 2, open: true };
            j++;
        }
    };
    // A comment kept whole to the end of its line (an HTML-like one), from k: the line terminator is no part of it.
    const keepLine = k => { let j = k; while (j < n && !jsLT(at(j))) j++; keeps.push({ s: k, e: j }); return j; };
    // A hashbang (#! on the very first line) is kept as it is, and is no token.
    if (src.startsWith('#!')) i = keepLine(0);
    while (i < n) {
        const c = at(i);
        if (jsLT(c)) { nl = true; i++; continue; }
        if (jsWS(c)) { i++; continue; }
        const c2 = at(i + 1);
        if (classic && c === 60 && src.startsWith('<!--', i)) { i = keepLine(i); continue; }   // <!-- in a classic script
        if (classic && c === 45 && (nl || !toks.length) && src.startsWith('-->', i)) { i = keepLine(i); continue; }   // --> at a line's start
        if (c === 47 && c2 === 47) {   // a // comment, to the end of its line (the line terminator is no part of it)
            let j = i + 2;
            while (j < n && !jsLT(at(j))) j++;
            cuts.push({ s: i, e: j, nl: false, line: true });
            i = j; continue;
        }
        if (c === 47 && c2 === 42) {   // a block comment
            const k = src.indexOf('*/', i + 2);
            if (k < 0) fail('a block comment that never ends', i);
            const e = k + 2;
            let hasNl = false;
            for (let j = i + 2; j < k; j++) if (jsLT(at(j))) { hasNl = true; break; }
            if (hasNl) nl = true;
            if (at(i + 2) !== 33) cuts.push({ s: i, e, nl: hasNl, line: false });   // /*! is a licence, and is kept
            else keeps.push({ s: i, e });
            i = e; continue;
        }
        if (c === 39 || c === 34) {    // a string in ' or "
            let j = i + 1;
            for (;;) {
                if (j >= n) fail('a string that never ends', i);
                const d = at(j);
                if (d === 92) { j += (at(j + 1) === 13 && at(j + 2) === 10) ? 3 : 2; continue; }   // an escape, or a line continuation in CRLF
                if (d === c) { j++; break; }
                if (d === 10 || d === 13) fail('a string that runs past its line', i);
                j++;
            }
            push('str', src.slice(i, j)); i = j; continue;
        }
        if (c === 96) {                // a template literal's first piece
            const p = tplPiece(i);
            push('tpl', src.slice(i, p.e), { open: p.open });
            if (p.open) { braces.push('t'); open('t'); }
            i = p.e; continue;
        }
        if (c === 125 && braces[braces.length - 1] === 't') {   // the } that ends a substitution, and the template's next piece
            braces.pop(); close();
            const p = tplPiece(i);
            push('tpl', src.slice(i, p.e), { open: p.open });
            if (p.open) { braces.push('t'); open('t'); }
            i = p.e; continue;
        }
        if (isDigit(c) || (c === 46 && isDigit(c2))) {   // a number: decimal, with a fraction or an exponent, hex / octal / binary, a BigInt
            let j = i;
            const dig = () => /[0-9_]/.test(src[j] || '');
            if (c === 48 && /[xXoObB]/.test(src[i + 1] || '')) { j = i + 2; while (j < n && /[0-9a-fA-F_]/.test(src[j])) j++; }
            else {
                while (dig()) j++;
                if (src[j] === '.') { j++; while (dig()) j++; }
                if (/[eE]/.test(src[j] || '') && (isDigit(at(j + 1)) || (/[+-]/.test(src[j + 1] || '') && isDigit(at(j + 2))))) { j += 2; while (dig()) j++; }
            }
            if (src[j] === 'n') j++;
            push('num', src.slice(i, j)); i = j; continue;
        }
        if (jsIdStart(c) || c === 92 || (c === 35 && (jsIdStart(c2) || c2 === 92))) {   // a name, a keyword, a #private name
            let j = i + (c === 35 ? 1 : 0);
            while (j < n) {
                const d = at(j);
                if (d === 92) {        // a \u escape inside a name
                    if (src[j + 1] === 'u' && src[j + 2] === '{') { const k = src.indexOf('}', j); j = k < 0 ? n : k + 1; }
                    else j += 6;
                    continue;
                }
                if (jsIdPart(d)) j++; else break;
            }
            j = Math.min(j, n);
            const prop = !!prev && prev.t === 'p' && (prev.v === '.' || prev.v === '?.');
            const v = src.slice(i, j);
            // the `of` of a for head: directly inside the head, after the name, ] or } that it binds (`for (const [a, b] of ...)`)
            const kw = v === 'of' && !prop && nest[nest.length - 1].k === 'f' && !!prev && (prev.t === 'id' || prev.v === ']' || prev.v === '}');
            push('id', v, kw ? { prop, kw } : { prop }); i = j; continue;
        }
        if (c === 47 && regexOk()) {   // a regular expression literal and its flags
            let j = i + 1, cls = false;
            for (;;) {
                if (j >= n) fail('a regular expression that never ends', i);
                const d = at(j);
                if (jsLT(d)) fail('a regular expression that runs past its line', i);
                if (d === 92) { j += 2; continue; }
                if (d === 91) cls = true;
                else if (d === 93) cls = false;
                else if (d === 47 && !cls) { j++; break; }
                j++;
            }
            while (j < n && jsIdPart(at(j))) j++;
            push('re', src.slice(i, j)); i = j; continue;
        }
        // a punctuator, the longest that matches (`?.` before a digit is `?` and a number: `a?.5:1`)
        let v = null;
        for (const p of PUNCT) {
            if (src.startsWith(p, i) && !(p === '?.' && isDigit(at(i + 2)))) { v = p; break; }
        }
        if (v === null) v = src[i];
        if (v === '{') { const k = braceKind(); braces.push(k); open(k); push('p', v); }
        else if (v === '}') { const k = braces.pop(); close(); push('p', v, { block: k !== 'e' }); }
        else if (v === '(') {
            // the head of if / while / for / with, or of `for await (`: the token before `await` is `for`
            const isFor = !!prev && prev.t === 'id' && !prev.prop && (prev.v === 'for'
                || (prev.v === 'await' && toks.length > 1 && toks[toks.length - 2].t === 'id' && toks[toks.length - 2].v === 'for' && !toks[toks.length - 2].prop));
            const ctrl = isFor || (!!prev && prev.t === 'id' && !prev.prop && CTRL_KW.has(prev.v));
            parens.push(ctrl); open(isFor ? 'f' : '('); push('p', v);
        }
        else if (v === ')') { close(); push('p', v, { ctrl: !!parens.pop() }); }
        else if (v === '[') { open('['); push('p', v); }
        else if (v === ']') { close(); push('p', v); }
        else if (v === '?') { nest[nest.length - 1].q++; push('p', v); }
        else if (v === ':') {
            // a conditional's colon answers an open ?; any other colon directly inside a block ends a label or a switch clause
            const top = nest[nest.length - 1];
            let stmt = false;
            if (top.q > 0) top.q--; else stmt = top.k === 'b';
            push('p', v, { stmt });
        }
        else if (v === '++' || v === '--') push('p', v, { post: postfix() });
        else push('p', v);
        i += v.length;
    }
    return { toks, cuts, keeps };
}

// The line terminators inside a piece of text, in their order: what a comment that held line breaks is replaced by. noSep leaves the
// line and paragraph separators out (CSS and HTML, where they are no line breaks).
function lineBreaks(text, noSep) {
    return (text.match(noSep ? /\r\n|\r|\n/g : /\r\n|\r|\n|\u2028|\u2029/g) || []).join('');
}
// Space or tab: the white space that is trimmed from around a comment that ends its line.
function hws(ch) { return ch === ' ' || ch === '\t'; }

/* outBuf() is the stripped text as it is built: a list of pieces joined once at the end. Building it by adding to one string and
   reading its last character after each comment made a large file (sheets.js, two megabytes and four thousand comments) take seconds,
   since each read flattened the whole string; a list keeps every step as short as the piece it touches.
   add(p) puts a piece at the end; last() is the last character so far ('' for none); trim() takes the spaces and tabs off the end;
   lineBlank() says whether everything since the last line break is spaces and tabs; text() is the whole. */
function outBuf() {
    const parts = [];
    return {
        add(p) { if (p) parts.push(p); },
        last() { for (let k = parts.length - 1; k >= 0; k--) if (parts[k].length) return parts[k][parts[k].length - 1]; return ''; },
        trim() {
            while (parts.length) {
                const p = parts[parts.length - 1];
                let e = p.length;
                while (e > 0 && hws(p[e - 1])) e--;
                if (e === p.length) return;
                if (e > 0) { parts[parts.length - 1] = p.slice(0, e); return; }
                parts.pop();
            }
        },
        lineBlank() {
            for (let k = parts.length - 1; k >= 0; k--) {
                const p = parts[k];
                for (let j = p.length - 1; j >= 0; j--) { const ch = p[j]; if (ch === '\n' || ch === '\r') return true; if (!hws(ch)) return false; }
            }
            return true;
        },
        text() { return parts.join(''); }
    };
}

/* stripJs(text, opts): the text with its comments taken out, by scanJs's cuts. Each comment is replaced as follows:
   - a comment that ends its line (only spaces or tabs after it before the line ends) goes with the spaces and tabs around it, so a
     line that held only a comment is left empty and a line of code keeps no trailing space;
   - a block comment that holds line breaks is replaced by those line breaks, so the lines below keep their numbers and a statement the
     line break ended stays ended;
   - any other block comment, between two tokens on one line, is replaced by one space where nothing else would keep the two apart
     (`a` comment `b` becomes `a b`), and by nothing where white space already stands beside it.
   The answer is never longer than the text, and every character of it that is not one of those spaces or line breaks is the text's
   own, in order. opts.classic is scanJs's: pass it for a classic script, so its HTML-like comments are read as V8 reads them. */
function stripJs(text, opts) {
    const { cuts } = scanJs(text, opts);
    if (!cuts.length) return text;
    const n = text.length, out = outBuf();
    let from = 0;
    for (const c of cuts) {
        out.add(text.slice(from, c.s));
        let k = c.e;
        while (k < n && hws(text[k])) k++;
        const endsLine = k >= n || jsLT(text.charCodeAt(k));
        if (c.nl || endsLine) {
            out.trim();
            if (c.nl) out.add(lineBreaks(text.slice(c.s, c.e)));
            from = endsLine ? k : c.e;
        } else {
            const l = out.last(), b = l ? l.charCodeAt(0) : 32, a = text.charCodeAt(c.e);
            const apart = jsWS(b) || jsLT(b) || jsWS(a) || jsLT(a);
            if (!apart) out.add(' ');
            from = c.e;
        }
    }
    out.add(text.slice(from));
    return out.text();
}

// The tokens of a JavaScript text, its comments left out, as the plain { t, v, nl } records the token check compares.
function jsTokens(text, opts) { return scanJs(text, opts).toks.map(x => ({ t: x.t, v: x.v, nl: x.nl })); }

/* ---------- CSS ---------- */

// The characters that are a CSS token of their own and may stand beside a removed comment without joining anything. A delimiter that
// can join another into one token (`~=`, `|=`, `+1`, `--x`) is left out on purpose: a comment beside one is kept (see stripCss).
const CSS_PUNCT = new Set(['{', '}', '(', ')', ';', ':', ',', '>', '[', ']']);
function cssWS(ch) { return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f'; }

/* scanCss(src) walks a style sheet once and answers { toks, cuts }: toks are its tokens but the comments, each { v, ws } where ws says
   white space stood before it (in CSS a space between two words is a descendant combinator, so it is compared), and cuts its comments
   { s, e, nl } (a /*! comment is kept). A string in ' or " is one token, `url(` with an unquoted address is one token to its `)` (an
   address may hold a slash and a star), each character of CSS_PUNCT is one, and any other run of characters is one. A comment ends a
   run, so `div`, comment, `p` is two tokens where `divp` is one, and the check sees the difference. */
function scanCss(src) {
    const n = src.length, toks = [], cuts = [];
    let i = 0, ws = false;
    const push = v => { toks.push({ v, ws }); ws = false; };
    while (i < n) {
        const ch = src[i];
        if (cssWS(ch)) { ws = true; i++; continue; }
        if (ch === '/' && src[i + 1] === '*') {
            const k = src.indexOf('*/', i + 2), e = k < 0 ? n : k + 2;
            if (src[i + 2] !== '!') cuts.push({ s: i, e, nl: /[\r\n\f]/.test(src.slice(i, e)) });
            i = e; continue;
        }
        if (ch === '"' || ch === "'") {
            let j = i + 1;
            while (j < n && src[j] !== ch && src[j] !== '\n' && src[j] !== '\r') j += src[j] === '\\' ? 2 : 1;
            if (src[j] === ch) j++;
            j = Math.min(j, n);
            push(src.slice(i, j)); i = j; continue;
        }
        if (CSS_PUNCT.has(ch)) { push(ch); i++; continue; }
        if (/^url\(/i.test(src.slice(i, i + 4))) {
            let j = i + 4;
            while (j < n && cssWS(src[j])) j++;
            if (src[j] !== '"' && src[j] !== "'") {
                while (j < n && src[j] !== ')') j += src[j] === '\\' ? 2 : 1;
                j = Math.min(j + 1, n);
                push(src.slice(i, j)); i = j; continue;
            }
            push(src.slice(i, i + 3)); i += 3; continue;   // `url`, then `(` and the quoted address as tokens of their own
        }
        let j = i;
        while (j < n && !cssWS(src[j]) && src[j] !== '"' && src[j] !== "'" && !CSS_PUNCT.has(src[j]) && !(src[j] === '/' && src[j + 1] === '*')) j += src[j] === '\\' ? 2 : 1;
        j = Math.min(j, n);
        push(src.slice(i, j)); i = j;
    }
    return { toks, cuts };
}

/* stripCss(text): the style sheet with its comments taken out. A comment that ends its line goes with the spaces around it, and one
   that holds line breaks is replaced by them, as in stripJs. A comment with white space beside it goes. A comment with no white space
   on either side goes only where it holds no line break and a character of CSS_PUNCT stands beside it, since anything else could join
   two tokens into one or make a space a combinator; such a comment is kept as it is. */
function stripCss(text) {
    const { cuts } = scanCss(text);
    if (!cuts.length) return text;
    const n = text.length, out = outBuf();
    let from = 0;
    for (const c of cuts) {
        const b = c.s > from ? text[c.s - 1] : (out.last() || ' '), a = c.e < n ? text[c.e] : ' ';
        const apart = cssWS(b) || cssWS(a);
        if (!apart && (c.nl || !(CSS_PUNCT.has(b) || CSS_PUNCT.has(a)))) continue;   // kept: `from` stays, so it is copied with what follows
        out.add(text.slice(from, c.s));
        let k = c.e;
        while (k < n && hws(text[k])) k++;
        const endsLine = k >= n || text[k] === '\n' || text[k] === '\r' || text[k] === '\f';
        if (c.nl || endsLine) {
            out.trim();
            if (c.nl) out.add(lineBreaks(text.slice(c.s, c.e), true));
            from = endsLine ? k : c.e;
        } else from = c.e;
    }
    out.add(text.slice(from));
    return out.text();
}

function cssTokens(text) { return scanCss(text).toks; }

/* ---------- HTML ---------- */

// The elements whose contents are not markup, so that a comment marker inside them is the element's own text and is never touched:
// the raw text elements (script, style, xmp, iframe, noembed, noframes, and noscript, which a page with scripting on reads as raw
// text), the RCDATA elements (title, textarea), plaintext (raw to the end of the page), and pre, which is markup but whose text the
// stripper leaves alone all the same. An svg's <title> is markup, not RCDATA; reading it as raw only leaves its comments in, which is
// the safe direction.
const HTML_RAW = new Set(['script', 'style', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'title', 'textarea', 'plaintext', 'pre']);

/* commentEnd(src, i) reads the comment that begins with <!-- at i as the HTML tokenizer reads one, and answers { e, odd }: e where it
   ends, and odd where it is not an ordinary <!-- ... --> comment. <!--> and <!---> close at once (an empty comment closed abruptly);
   any other comment closes at the first --> or --!> after its <!--, and one that never closes runs to the end of the page. A browser
   shows what follows <!--> or --!>, so ending such a comment at the next --> instead would swallow markup. odd is set for those
   three forms and for one that never closes; stripHtml leaves an odd comment as it is. */
function commentEnd(src, i) {
    const n = src.length;
    if (src.startsWith('<!-->', i)) return { e: i + 5, odd: true };
    if (src.startsWith('<!--->', i)) return { e: i + 6, odd: true };
    const a = src.indexOf('-->', i + 4), b = src.indexOf('--!>', i + 4);
    if (a < 0 && b < 0) return { e: n, odd: true };
    if (b >= 0 && (a < 0 || b < a)) return { e: b + 4, odd: true };
    return { e: a + 3, odd: false };
}

/* walkHtml(src, on) reads a page once and hands each part to `on`: on.text(s, e) for text, on.comment(s, e, odd) for <!-- --> (see
   commentEnd for where one ends and what odd says), on.tag(s, e, name, closing) for a tag (its attribute values, in quotes or not,
   read through, so a `<!--` or a `>` inside one is no markup), on.raw(s, e, name, openTag) for the contents of an element of HTML_RAW,
   and on.decl(s, e) for <!DOCTYPE ...> and <?...>. A raw element's / before its > closes nothing (HTML reads `<title/>` as an open
   title), so its contents run to its end tag whatever its open tag says. */
function walkHtml(src, on) {
    const n = src.length;
    let i = 0;
    while (i < n) {
        if (src.startsWith('<!--', i)) {
            const c = commentEnd(src, i);
            on.comment(i, c.e, c.odd); i = c.e; continue;
        }
        const closing = src[i] === '<' && src[i + 1] === '/';
        if (src[i] === '<' && /[A-Za-z]/.test(src[i + (closing ? 2 : 1)] || '')) {
            let j = i + (closing ? 2 : 1);
            while (j < n && /[A-Za-z0-9:-]/.test(src[j])) j++;
            const name = src.slice(i + (closing ? 2 : 1), j).toLowerCase();
            while (j < n && src[j] !== '>') {
                if (src[j] === '"' || src[j] === "'") { const k = src.indexOf(src[j], j + 1); j = k < 0 ? n : k + 1; }
                else j++;
            }
            j = Math.min(j + 1, n);
            on.tag(i, j, name, closing);
            const open = src.slice(i, j);
            if (!closing && HTML_RAW.has(name)) {
                const m = new RegExp('</' + name + '[\\s>/]', 'i').exec(src.slice(j));
                const ce = (m && name !== 'plaintext') ? j + m.index : n;   // plaintext has no end tag: it runs to the end of the page
                on.raw(j, ce, name, open);
                i = ce;
            } else i = j;
            continue;
        }
        if (src.startsWith('<!', i) || src.startsWith('<?', i)) {
            const k = src.indexOf('>', i), e = k < 0 ? n : k + 1;
            on.decl(i, e); i = e; continue;
        }
        let j = i + 1;
        while (j < n && src[j] !== '<') j++;
        on.text(i, j); i = j;
    }
}

// What an inline <script> holds: JavaScript as a classic script, JavaScript as a module, or something else (a template, JSON), which
// is left as it is. A script with a src attribute holds nothing of its own.
function scriptKind(openTag) {
    if (/\ssrc\s*=/i.test(openTag)) return 'none';
    const m = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(openTag);
    const t = m ? m[1].toLowerCase() : '';
    if (t === 'module') return 'module';
    if (!t || t === 'text/javascript' || t === 'application/javascript') return 'classic';
    return 'none';
}

/* stripHtml(text, opts): the page with its <!-- --> comments taken out (a <!--! comment is kept, as /*! is, and so is an odd one, see
   commentEnd: only an ordinary <!-- ... --> is taken out). A comment that stands alone on its line goes with the spaces before and
   after it on that line; every comment is replaced by the line breaks it held, but for one that held line breaks with no white space
   on either side of it, which is kept emptied (<!--, its line breaks, -->), since line breaks put between two words or two tags would
   show as a space. Script and style contents go through stripJs and stripCss; the contents of every other element of HTML_RAW, tags
   and attribute values are never touched. Where opts.removed is a list, each comment taken out (or emptied) is put on it as { s, e },
   its place in the text, which stripTree hands to htmlRemovedSays. */
function stripHtml(text, opts) {
    const removed = opts && Array.isArray(opts.removed) ? opts.removed : null;
    const n = text.length, out = outBuf();
    let skip = 0;   // skip: spaces after a lone comment, taken off the text that follows it
    const put = (s, e) => { if (skip) { s += Math.min(skip, e - s); skip = 0; } out.add(text.slice(s, e)); };
    walkHtml(text, {
        text: put,
        decl: (s, e) => { skip = 0; out.add(text.slice(s, e)); },
        tag: (s, e) => { skip = 0; out.add(text.slice(s, e)); },
        raw: (s, e, name, open) => {
            skip = 0;
            const body = text.slice(s, e);
            const sk = name === 'script' ? scriptKind(open) : '';
            if (name === 'script') out.add(sk === 'none' ? body : stripJs(body, { classic: sk === 'classic' }));
            else if (name === 'style') out.add(stripCss(body));
            else out.add(body);
        },
        comment: (s, e, odd) => {
            skip = 0;
            if (odd || text[s + 4] === '!') { out.add(text.slice(s, e)); return; }
            if (removed) removed.push({ s, e });
            let k = e;
            while (k < n && hws(text[k])) k++;
            const alone = out.lineBlank() && (k >= n || text[k] === '\n' || text[k] === '\r');
            if (alone) { out.trim(); skip = k - e; }
            const nls = lineBreaks(text.slice(s, e), true), b = out.last();
            // line breaks put where nothing but the comment stood (between two words, or two tags) would show as a space, so there the
            // comment is kept, emptied of all but its line breaks
            const apart = alone || !nls || /\s/.test(b || ' ') || e >= n || /\s/.test(text[e]);
            out.add(apart ? nls : '<!--' + nls + '-->');
        }
    });
    return out.text();
}

/* htmlSig(text) is what the HTML check compares between a page and its stripped copy: every tag and declaration as it is, the tokens of
   each inline script and style, the contents of pre and textarea as they are, and the text between tags with its runs of white space
   folded to one space (a comment taken out of `a <!-- x --> b` leaves two spaces where there were one and one, which a browser shows
   alike). */
function htmlSig(text) {
    const sig = [];
    let buf = null;
    const flush = () => { if (buf !== null) { sig.push('X:' + buf.replace(/\s+/g, ' ')); buf = null; } };
    walkHtml(text, {
        text: (s, e) => { buf = (buf || '') + text.slice(s, e); },
        comment: () => {},
        decl: (s, e) => { flush(); sig.push('D:' + text.slice(s, e)); },
        tag: (s, e) => { flush(); sig.push('T:' + text.slice(s, e)); },
        raw: (s, e, name, open) => {
            flush();
            const body = text.slice(s, e);
            const sk = name === 'script' ? scriptKind(open) : 'none';
            if (sk !== 'none') sig.push('J:' + JSON.stringify(jsTokens(body, { classic: sk === 'classic' })));
            else if (name === 'style') sig.push('C:' + JSON.stringify(cssTokens(body)));
            else sig.push('R:' + body);
        }
    });
    flush();
    return sig;
}

// How many <!-- --> comments a page holds outside its raw elements.
function htmlComments(text) { let k = 0; walkHtml(text, { text() {}, decl() {}, tag() {}, raw() {}, comment: () => { k++; } }); return k; }

/* htmlRemovedSays(text, removed): the comments stripHtml took out of a page, judged apart from walkHtml, which found them (so that a
   misreading of walkHtml, which htmlSig would share, is caught here). Each one must:
   - begin with <!-- and be no empty comment that closes at once (<!--> or <!--->);
   - end with the first --> after its <!--, and hold no --!> (either of which a browser would read as its end);
   - lie outside every element whose contents are no markup, found here by a scan of its own (each comment of the plain form passed
     over, each open tag of an HTML_RAW element taken to its own end tag).
   The answer is a short line naming the first that fails, or null where all hold. */
function htmlRemovedSays(text, removed) {
    const raw = [];
    const re = /<!--[\s\S]*?-->|<(script|style|xmp|iframe|noembed|noframes|noscript|title|textarea|plaintext|pre)(?=[\s>/])[^>]*>/gi;
    const low = text.toLowerCase();
    let m;
    while ((m = re.exec(text))) {
        if (!m[1]) continue;
        const name = m[1].toLowerCase(), s = m.index + m[0].length;
        const end = name === 'plaintext' ? -1 : low.indexOf('</' + name, s);
        const e = end < 0 ? text.length : end;
        raw.push([s, e]);
        re.lastIndex = e;
    }
    const line = s => (text.slice(0, s).match(/\r\n|\r|\n/g) || []).length + 1;
    for (const r of removed) {
        const body = text.slice(r.s, r.e);
        if (!body.startsWith('<!--') || body.startsWith('<!-->') || body.startsWith('<!--->')) return 'the comment at line ' + line(r.s) + ' is no ordinary <!-- -->';
        if (text.indexOf('-->', r.s + 4) !== r.e - 3) return 'the comment at line ' + line(r.s) + ' does not end at the first --> after it';
        if (body.includes('--!>')) return 'the comment at line ' + line(r.s) + ' holds --!>, which ends it in a browser';
        if (raw.some(([a, b]) => r.s >= a && r.s < b)) return 'the comment at line ' + line(r.s) + ' stands inside an element whose contents are no markup';
    }
    return null;
}

/* ---------- reading and writing bytes ---------- */

// A file's bytes as text: UTF-8 where that reading writes back the very same bytes, else latin1, which always does. The answer says
// which, so the stripped text is written back the same way and every byte that is no comment comes out as it went in.
function decode(buf) {
    const u = buf.toString('utf8');
    if (Buffer.from(u, 'utf8').equals(buf)) return { text: u, enc: 'utf8' };
    return { text: buf.toString('latin1'), enc: 'latin1' };
}
// How many line breaks a text holds (CRLF counted once), which a strip must keep.
function lineCount(text) { return (text.match(/\r\n|\r|\n/g) || []).length; }

/* ---------- parsing, by Node's own parser ---------- */

/* parseClassic(text, name): the error message where the text is not a classic script V8 would load, else null. vm.Script compiles
   without running anything. */
function parseClassic(text, name) {
    try { new vm.Script(text, { filename: name }); return null; } catch (e) { return String(e && e.message || e); }
}

/* parseModules(files): which of the files fail to parse as an ES module, judged by V8 itself. One child Node run with
   --experimental-vm-modules builds a vm.SourceTextModule from each file, which parses it and nothing more (nothing is run, no import is
   followed). Where that class is not there, each file is copied to a .mjs of its own and handed to `node --check`. The answer maps a
   file to its error message, for the files that failed alone. */
function parseModules(files) {
    const bad = {};
    if (!files.length) return bad;
    const child = "const vm=require('vm'),fs=require('fs');const list=JSON.parse(fs.readFileSync(0,'utf8'));"
        + "if(typeof vm.SourceTextModule!=='function'){process.stdout.write(JSON.stringify({nosupport:true}));}"
        + "else{const bad={};for(const f of list){try{new vm.SourceTextModule(fs.readFileSync(f,'utf8'),{identifier:f});}"
        + "catch(e){bad[f]=String(e&&e.message||e);}}process.stdout.write(JSON.stringify({bad}));}";
    const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', '-e', child], { input: JSON.stringify(files), encoding: 'utf8', maxBuffer: 64 << 20 });
    let ans = null;
    try { ans = JSON.parse(r.stdout || ''); } catch (e) { ans = null; }
    if (ans && ans.bad) return ans.bad;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-strip-check-'));
    try {
        files.forEach((f, k) => {
            const m = path.join(tmp, k + '.mjs');
            fs.copyFileSync(f, m);
            const c = spawnSync(process.execPath, ['--check', m], { encoding: 'utf8' });
            if (c.status !== 0) bad[f] = String(c.stderr || 'node --check failed').trim().split('\n').slice(0, 6).join(' ');
        });
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    return bad;
}

/* ---------- the tree ---------- */

// The folders of the app that are never stripped, whatever their files are named: the bundled libraries keep their licence headers,
// and the typefaces are their makers' files.
const KEEP_DIRS = ['assets/vendor', 'assets/fonts'];

// Every file under a folder, as paths relative to it written with forward slashes, in a fixed order. A link or a junction refuses.
function listTree(dir) {
    const out = [];
    const walk = rel => {
        const ents = fs.readdirSync(rel ? path.join(dir, rel) : dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
        for (const e of ents) {
            const r = rel ? rel + '/' + e.name : e.name;
            if (e.isDirectory()) walk(r);
            else if (e.isFile()) out.push(r);
            else throw new Error('stripTree refused ' + r + ': it is neither a file nor a folder (a link or a junction)');
        }
    };
    walk('');
    return out;
}

/* classicScripts(dir, htmls): the .js files a page loads as classic scripts, read from each page's <script src> tags that do not say
   type="module" (index.html's four boot scripts and tooltips.js). Every other .js of the app is an ES module, which is how parsecheck
   reads them too. An address is read as the browser reads it: its ?query and #hash are no part of the file, a %-escape is decoded, a
   relative address is taken from the page's folder, and a root-absolute one (/scripts/x.js) from the tree's root, which the server
   serves at /. A root-absolute address that names no file of the tree (/api/prefs.js, which the server writes) is passed over, and so
   is one of another site or scheme. */
function classicScripts(dir, htmls) {
    const set = new Set();
    for (const h of htmls) {
        const text = decode(fs.readFileSync(path.join(dir, h))).text;
        const base = path.posix.dirname(h);
        walkHtml(text, {
            text() {}, comment() {}, decl() {}, raw() {},
            tag: (s, e, name, closing) => {
                if (name !== 'script' || closing) return;
                const open = text.slice(s, e);
                const m = /\ssrc\s*=\s*["']?([^"'\s>]+)/i.exec(open);
                if (!m || /\stype\s*=\s*["']?module/i.test(open)) return;
                let addr = m[1].replace(/[?#].*$/, '');
                try { addr = decodeURIComponent(addr); } catch (err) { /* a broken escape: the address as written */ }
                if (!addr || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(addr)) return;
                if (addr.startsWith('/')) {
                    const rel = path.posix.normalize(addr.slice(1));
                    if (fs.existsSync(path.join(dir, rel))) set.add(rel);
                    return;
                }
                set.add(path.posix.normalize(base === '.' ? addr : base + '/' + addr));
            }
        });
    }
    return set;
}

/* acornCheck(items): the independent check of the JavaScript strip. acorn is the JavaScript parser Node bundles for its own use
   (lib/internal/deps/acorn); a child Node run with --expose-internals reaches it, so no package is installed. Each item is
   { file, src, out, module }: the source and stripped files on disk, and whether the file is a module (else a classic script). For
   each, the child parses the source (ecmaVersion latest, as a module or a script, a hashbang allowed) and answers every comment it
   found, as [start, end], and the comments it finds in the stripped copy; and it parses the stripped copy and compares the two token
   streams, each token by its kind, its exact text and whether a line break stands before it (in white space or inside a comment), so
   a strip that joined two tokens or dropped a line break that ended a statement is caught by a reader that shares no code with
   scanJs. The answer maps a file to { comments, outComments, diff } where diff names the first token that differs (null where none
   does), or to { error } where acorn could not read a file; or it is { unavailable: message } where acorn could not be reached. */
function acornCheck(items) {
    if (!items.length) return {};
    // The child's whole program. It is passed to `node -e` as one string (fn.toString()), so it may use no name of this file.
    const child = function() {
        const fs = require('fs');
        let acorn;
        try { acorn = require('internal/deps/acorn/acorn/dist/acorn'); }
        catch (e) { process.stdout.write(JSON.stringify({ unavailable: String(e && e.message || e) })); return; }
        const list = JSON.parse(fs.readFileSync(0, 'utf8'));
        const read = (text, module) => {
            const comments = [], toks = [];
            acorn.parse(text, { ecmaVersion: 'latest', sourceType: module ? 'module' : 'script', allowHashBang: true,
                onComment: (block, t, s, e) => comments.push([s, e]), onToken: toks });
            const sig = [];
            let last = 0;
            for (const t of toks) {
                if (t.type.label === 'eof') break;
                sig.push(t.type.label + '\u0001' + text.slice(t.start, t.end) + '\u0001' + (/[\n\r\u2028\u2029]/.test(text.slice(last, t.start)) ? 1 : 0));
                last = t.end;
            }
            return { comments, sig };
        };
        const ans = {};
        for (const it of list) {
            try {
                const a = read(fs.readFileSync(it.src, 'utf8'), it.module), b = read(fs.readFileSync(it.out, 'utf8'), it.module);
                let diff = null;
                const m = Math.max(a.sig.length, b.sig.length);
                for (let k = 0; k < m; k++) {
                    if (a.sig[k] !== b.sig[k]) {
                        const show = x => x === undefined ? 'nothing' : JSON.stringify(x.split('\u0001')[1].slice(0, 60)) + (x.endsWith('\u00011') ? ' after a line break' : '');
                        diff = 'token ' + (k + 1) + ' was ' + show(a.sig[k]) + ' and is ' + show(b.sig[k]);
                        break;
                    }
                }
                ans[it.file] = { comments: a.comments, outComments: b.comments, diff };
            } catch (e) { ans[it.file] = { error: String(e && e.message || e) }; }
        }
        process.stdout.write(JSON.stringify(ans));
    };
    const r = spawnSync(process.execPath, ['--expose-internals', '--no-warnings', '-e', '(' + child.toString() + ')()'],
        { input: JSON.stringify(items), encoding: 'utf8', maxBuffer: 256 << 20 });
    try { return JSON.parse(r.stdout || ''); }
    catch (e) { return { unavailable: 'the child Node run gave no answer (' + String(r.stderr || r.error || 'no output').trim().split('\n').slice(0, 3).join(' ') + ')' }; }
}

// Where two token lists first differ, as a short line for a refusal, or null where they are the same.
function tokDiff(a, b, show) {
    const m = Math.max(a.length, b.length);
    for (let k = 0; k < m; k++) {
        const x = a[k], y = b[k];
        if (!x || !y || JSON.stringify(x) !== JSON.stringify(y)) return 'token ' + (k + 1) + ' was ' + show(x) + ' and is ' + show(y);
    }
    return null;
}

/* stripTree(srcDir, outDir, opts): copies every file of srcDir into outDir (a folder that must be new or empty, and neither inside the
   other) with the comments taken out of each .js, .css and .html file outside KEEP_DIRS. Every other file is copied byte for byte.
   It refuses, throwing an error that begins "stripTree refused" and names the file, where:
   - a stripped .js file does not parse as the kind its source is (a classic script by vm.Script, a module by parseModules);
   - its tokens, comments left out, differ from the source's in text, kind or the line breaks between them (see scanJs);
   - a .js file is not exact UTF-8 (see the note on bytes at the top);
   - acorn, read apart from scanJs (see acornCheck), does not find exactly the comments scanJs found in the source (those it cuts and
     those it keeps), finds any comment in the stripped copy but the kept ones, or reads other tokens or other line breaks between them
     in the stripped copy than in the source; or acorn could not read a file, or could not be reached at all;
   - a stripped .css file's tokens, or a stripped page's tags, text and inline code, differ from the source's;
   - a comment taken out of a page fails htmlRemovedSays;
   - a stripped file has more or fewer lines than its source, or is longer.
   The answer is a report: { files, copied, stripped: [{ file, kind, before, after, comments }], before, after, saved }, where before
   and after count the bytes of the files that were stripped and saved what they lost.
   opts.skip(rel) leaves a file out of the copy altogether. opts.stripJs, opts.stripCss and opts.stripHtml stand in for the strippers,
   which only the suite uses, to prove each refusal. */
function stripTree(srcDir, outDir, opts) {
    opts = opts || {};
    const src = path.resolve(srcDir), out = path.resolve(outDir);
    const inside = (a, b) => (a + path.sep).startsWith(b + path.sep);
    if (inside(out, src) || inside(src, out)) throw new Error('stripTree refused: the copy and the source may not lie inside each other');
    if (fs.existsSync(out) && fs.readdirSync(out).length) throw new Error('stripTree refused: ' + out + ' is not empty');
    const sJs = opts.stripJs || stripJs, sCss = opts.stripCss || stripCss, sHtml = opts.stripHtml || stripHtml;
    const files = listTree(src).filter(r => !(opts.skip && opts.skip(r)));
    const keep = r => KEEP_DIRS.some(d => r === d || r.startsWith(d + '/'));
    const kindOf = r => keep(r) ? null : /\.js$/i.test(r) ? 'js' : /\.css$/i.test(r) ? 'css' : /\.html?$/i.test(r) ? 'html' : null;
    const classic = classicScripts(src, files.filter(r => kindOf(r) === 'html'));
    const report = { files: files.length, copied: 0, stripped: [], before: 0, after: 0, saved: 0 };
    const modules = [], scripts = [];
    const refuse = (r, why) => { throw new Error('stripTree refused ' + r + ': ' + why); };
    fs.mkdirSync(out, { recursive: true });
    for (const r of files) {
        const from = path.join(src, r), to = path.join(out, r);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        const kind = kindOf(r);
        if (!kind) { fs.copyFileSync(from, to); report.copied++; continue; }
        const buf = fs.readFileSync(from);
        const { text, enc } = decode(buf);
        if (kind === 'js' && enc !== 'utf8') refuse(r, 'it is not UTF-8, and the app serves its scripts as UTF-8 (read as latin1, a line separator would be no line break to the tokenizer)');
        const isClassic = kind === 'js' && classic.has(r);
        const removed = [];
        let res, comments = 0, ranges = null;
        try {
            if (kind === 'js') {
                const sc = scanJs(text, { classic: isClassic });
                comments = sc.cuts.length;
                ranges = sc.cuts.map(c => [c.s, c.e]).concat(sc.keeps.map(c => [c.s, c.e, 1])).sort((a, b) => a[0] - b[0]);
                res = sJs(text, { classic: isClassic });
            }
            else if (kind === 'css') { comments = scanCss(text).cuts.length; res = sCss(text); }
            else { comments = htmlComments(text); res = sHtml(text, { removed }); }
        } catch (e) { refuse(r, 'it could not be read (' + e.message + ')'); }
        const ob = Buffer.from(res, enc);
        if (ob.length > buf.length) refuse(r, 'it grew from ' + buf.length + ' to ' + ob.length + ' bytes');
        if (lineCount(res) !== lineCount(text)) refuse(r, 'it went from ' + lineCount(text) + ' lines to ' + lineCount(res));
        if (kind === 'js') {
            let d;
            try { d = tokDiff(jsTokens(text, { classic: isClassic }), jsTokens(res, { classic: isClassic }), x => x ? JSON.stringify(x.v) + (x.nl ? ' after a line break' : '') : 'nothing'); }
            catch (e) { d = 'the stripped file could not be read (' + e.message + ')'; }
            if (d) refuse(r, 'its tokens differ from the source\'s: ' + d);
            if (isClassic) { const err = parseClassic(ob.toString('utf8'), r); if (err) refuse(r, 'it no longer parses as a classic script: ' + err); }
            else modules.push({ r, to });
            scripts.push({ r, from, to, module: !isClassic, ranges, text, res });
            report.stripped.push({ file: r, kind: isClassic ? 'classic' : 'module', before: buf.length, after: ob.length, comments });
        } else if (kind === 'css') {
            const d = tokDiff(cssTokens(text), cssTokens(res), x => x ? JSON.stringify(x.v) + (x.ws ? ' after white space' : '') : 'nothing');
            if (d) refuse(r, 'its tokens differ from the source\'s: ' + d);
            report.stripped.push({ file: r, kind: 'css', before: buf.length, after: ob.length, comments });
        } else {
            const d = tokDiff(htmlSig(text), htmlSig(res), x => x ? JSON.stringify(String(x).slice(0, 80)) : 'nothing');
            if (d) refuse(r, 'its markup differs from the source\'s: ' + d);
            const said = htmlRemovedSays(text, removed);
            if (said) refuse(r, said);
            report.stripped.push({ file: r, kind: 'html', before: buf.length, after: ob.length, comments });
        }
        fs.writeFileSync(to, ob);
        report.before += buf.length; report.after += ob.length;
    }
    const bad = parseModules(modules.map(m => m.to));
    for (const m of modules) if (bad[m.to]) refuse(m.r, 'it no longer parses as a module: ' + bad[m.to]);
    // the independent check: acorn's comments and tokens against scanJs's, file by file (see acornCheck)
    const ac = acornCheck(scripts.map(x => ({ file: x.r, src: x.from, out: x.to, module: x.module })));
    if (ac.unavailable) refuse(scripts[0].r, 'Node\'s own copy of acorn, the independent check, could not be reached: ' + ac.unavailable);
    const lineAt = (t, k) => (t.slice(0, k).match(/\r\n|\r|\n|\u2028|\u2029/g) || []).length + 1;
    for (const x of scripts) {
        const a = ac[x.r];
        if (!a) refuse(x.r, 'acorn gave no answer for it');
        if (a.error) refuse(x.r, 'acorn could not read it as a ' + (x.module ? 'module' : 'classic script') + ': ' + a.error);
        const mine = x.ranges, theirs = a.comments;
        for (let k = 0; k < Math.max(mine.length, theirs.length); k++) {
            const m = mine[k], t = theirs[k];
            if (!m || !t || m[0] !== t[0] || m[1] !== t[1]) {
                const at = Math.min(m ? m[0] : Infinity, t ? t[0] : Infinity);
                refuse(x.r, 'acorn and the tokenizer read its comments differently from line ' + lineAt(x.text, at) + ' on (the tokenizer '
                    + (m ? 'has a comment at line ' + lineAt(x.text, m[0]) : 'has no more comments') + ', acorn ' + (t ? 'has one at line ' + lineAt(x.text, t[0]) : 'has no more') + ')');
            }
        }
        const keptTexts = mine.filter(m => m[2]).map(m => x.text.slice(m[0], m[1]));
        const outTexts = a.outComments.map(c => x.res.slice(c[0], c[1]));
        if (JSON.stringify(keptTexts) !== JSON.stringify(outTexts)) refuse(x.r, 'acorn finds other comments in the stripped copy than the kept ones (' + outTexts.length + ' found, ' + keptTexts.length + ' kept)');
        if (a.diff) refuse(x.r, 'acorn reads other tokens in the stripped copy than in the source: ' + a.diff);
    }
    report.saved = report.before - report.after;
    return report;
}

module.exports = {
    stripJs, stripCss, stripHtml, stripTree,
    scanJs, jsTokens, scanCss, cssTokens, walkHtml, htmlSig, htmlComments, htmlRemovedSays, commentEnd,
    parseClassic, parseModules, acornCheck, classicScripts, listTree, decode, lineCount, KEEP_DIRS
};
